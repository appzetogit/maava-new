/**
 * Prepares existing incentive history for the unique award index.
 *
 * MUST RUN BEFORE the deploy that ships deliveryIncentive.service.js, and AFTER
 * scripts/backfill-vertical.js has stamped `vertical` on these collections.
 *
 * The new index is { vertical, offerId, deliveryPartnerId, cycle } unique, and it
 * is the thing that stops a rider being paid twice for the same offer. Two facts
 * about the data predating it:
 *
 *  1. No document has `cycle`. A missing key indexes as null, which is fine on
 *     its own -- but only if nothing else collides.
 *  2. The old dedupe checked `status: { $in: ['pending', 'credited'] }`, so a
 *     CANCELLED award did not stop a second one being written for the same offer
 *     and rider. Those pairs exist in production and would collide on
 *     (offerId, deliveryPartnerId, null), and mongoose's autoIndex would then
 *     fail to build the index -- quietly, on a connection event, leaving the
 *     award path with no lock at all.
 *
 * Collided rows are numbered in creation order rather than deleted. They are a
 * financial ledger: two successive attempts at the same offer genuinely are
 * cycle 0 and cycle 1, and dropping one would erase a payout record.
 *
 *   node scripts/migrate-incentive-cycles.js            # dry run, counts only
 *   node scripts/migrate-incentive-cycles.js --apply    # writes
 *
 * Safe to run repeatedly: it only touches documents still missing `cycle`, and
 * re-numbering is idempotent once the groups are already distinct.
 *
 * Uses the raw driver, not the models -- the scoping plugin would filter out the
 * very documents that have no `vertical` yet.
 */
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';

const HISTORY = 'food_earning_addon_history';
const OFFERS = 'food_earning_addons';

const apply = process.argv.slice(2).includes('--apply');

/** Which of two colliding rows deserves the earlier cycle. */
const ORDER = { credited: 0, pending: 1, failed: 2, cancelled: 3 };

const run = async () => {
    if (!config.mongodbUri) throw new Error('MONGO_URI / MONGODB_URI is not set');
    await mongoose.connect(config.mongodbUri);
    const db = mongoose.connection.db;
    const history = db.collection(HISTORY);

    // --- Guard: `vertical` must already be stamped -------------------------
    const missingVertical = await history.countDocuments({ vertical: { $exists: false } });
    const missingOfferVertical = await db.collection(OFFERS).countDocuments({ vertical: { $exists: false } });
    if (missingVertical || missingOfferVertical) {
        throw new Error(
            `Run scripts/backfill-vertical.js --apply first: ` +
            `${missingVertical} history and ${missingOfferVertical} offer documents still have no vertical. ` +
            `Numbering cycles before that would group rows by a null vertical and re-number the wrong ones together.`
        );
    }

    // --- Step 1: stamp cycle 0 --------------------------------------------
    const needCycle = await history.countDocuments({ cycle: { $exists: false } });
    console.log(`[1/2] history rows missing 'cycle': ${needCycle}`);
    if (needCycle && apply) {
        const res = await history.updateMany({ cycle: { $exists: false } }, { $set: { cycle: 0 } });
        console.log(`      stamped cycle=0 on ${res.modifiedCount}`);
    }

    // --- Step 2: re-number collisions -------------------------------------
    // Grouped after step 1, so in --apply mode everything has a cycle; in dry
    // run a missing cycle groups as null, which finds the same collisions.
    const groups = await history.aggregate([
        {
            $group: {
                _id: {
                    vertical: '$vertical',
                    offerId: '$offerId',
                    deliveryPartnerId: '$deliveryPartnerId',
                    cycle: { $ifNull: ['$cycle', 0] }
                },
                n: { $sum: 1 },
                docs: { $push: { _id: '$_id', status: '$status', createdAt: '$createdAt' } }
            }
        },
        { $match: { n: { $gt: 1 } } }
    ]).toArray();

    const extra = groups.reduce((sum, g) => sum + g.n - 1, 0);
    console.log(`[2/2] colliding groups: ${groups.length} (${extra} rows need a new cycle)`);

    for (const group of groups) {
        // Credited first, then pending, then the rejected ones; ties by age. The
        // row that actually paid keeps cycle 0 so reports over it stay stable.
        const sorted = [...group.docs].sort((a, b) => {
            const byStatus = (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9);
            if (byStatus !== 0) return byStatus;
            return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        });

        for (let i = 1; i < sorted.length; i += 1) {
            const base = Number(group._id.cycle) || 0;
            console.log(
                `      offer ${group._id.offerId} rider ${group._id.deliveryPartnerId}: ` +
                `${sorted[i].status} row ${sorted[i]._id} -> cycle ${base + i}`
            );
            if (apply) {
                await history.updateOne({ _id: sorted[i]._id }, { $set: { cycle: base + i } });
            }
        }
    }

    // --- Verify ------------------------------------------------------------
    if (apply) {
        const still = await history.aggregate([
            {
                $group: {
                    _id: {
                        vertical: '$vertical',
                        offerId: '$offerId',
                        deliveryPartnerId: '$deliveryPartnerId',
                        cycle: '$cycle'
                    },
                    n: { $sum: 1 }
                }
            },
            { $match: { n: { $gt: 1 } } }
        ]).toArray();
        if (still.length) {
            throw new Error(`${still.length} groups still collide; the unique index would fail to build`);
        }
        console.log('verified: no remaining collisions — the unique index can build');
    } else {
        console.log('\ndry run — nothing written. Re-run with --apply');
    }

    await mongoose.disconnect();
};

run().catch(async (e) => {
    console.error(e.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});

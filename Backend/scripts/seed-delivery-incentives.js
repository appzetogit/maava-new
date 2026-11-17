/**
 * Creates a spread of delivery incentive offers so the feature can be exercised
 * end to end without hand-building each one in the admin panel.
 *
 *   node scripts/seed-delivery-incentives.js            (dry run, prints only)
 *   node scripts/seed-delivery-incentives.js --apply    (writes)
 *   node scripts/seed-delivery-incentives.js --apply --vertical=quick
 *   node scripts/seed-delivery-incentives.js --apply --remove   (delete them again)
 *
 * The five offers deliberately cover the cases that behave differently rather
 * than five variations of the same thing:
 *
 *   1. small one-shot, auto-credited  -- the happy path; money lands unattended
 *   2. repeatable, auto-credited      -- pays again on every further multiple
 *   3. one-shot, manual approval      -- parks a `pending` row for the admin
 *   4. capped at 2 redemptions        -- proves the cap actually blocks a payout
 *   5. ends tomorrow                  -- drives the "Ends in 1d" urgency chip
 *
 * Every offer is titled with the SEED_TAG prefix, which is the only thing
 * --remove matches on. Nothing an admin created by hand can be deleted by this
 * script, however similar it looks.
 *
 * Safe to re-run: offers are matched by title within the vertical and updated
 * rather than duplicated.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodEarningAddon } from '../src/modules/food/admin/models/earningAddon.model.js';
import { FoodEarningAddonHistory } from '../src/modules/food/admin/models/earningAddonHistory.model.js';
import { runWithVertical, VERTICALS } from '../src/core/vertical/verticalScope.js';

const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove');
const VERTICAL =
    process.argv.find((a) => a.startsWith('--vertical='))?.split('=')[1] || 'food';

/** Prefix that marks an offer as belonging to this script. */
const SEED_TAG = '[demo]';

const days = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(n < 0 ? 0 : 23, n < 0 ? 0 : 59, 59, 999);
    return d;
};

const OFFERS = [
    {
        title: `${SEED_TAG} 5 deliveries, earn ₹100`,
        description: 'Complete 5 deliveries and ₹100 is added to your wallet.',
        requiredOrders: 5,
        earningAmount: 100,
        startDate: days(-7),
        endDate: days(30),
        maxRedemptions: null,
        repeatable: false,
        autoCredit: true,
    },
    {
        title: `${SEED_TAG} Every 5 deliveries, earn ₹120`,
        description: 'Pays again on every 5 deliveries. No limit.',
        requiredOrders: 5,
        earningAmount: 120,
        startDate: days(-7),
        endDate: days(30),
        maxRedemptions: null,
        repeatable: true,
        autoCredit: true,
    },
    {
        title: `${SEED_TAG} 10 deliveries, earn ₹250 (approval)`,
        description: 'Unlocks at 10 deliveries, then an admin releases the payout.',
        requiredOrders: 10,
        earningAmount: 250,
        startDate: days(-7),
        endDate: days(30),
        maxRedemptions: null,
        repeatable: false,
        autoCredit: false,
    },
    {
        title: `${SEED_TAG} 3 deliveries, earn ₹75 (first 2 riders)`,
        description: 'Only the first 2 riders to finish get paid.',
        requiredOrders: 3,
        earningAmount: 75,
        startDate: days(-7),
        endDate: days(30),
        maxRedemptions: 2,
        repeatable: false,
        autoCredit: true,
    },
    {
        title: `${SEED_TAG} 2 deliveries, earn ₹40 (ends soon)`,
        description: 'Ends tomorrow -- drives the urgency chip in the rider app.',
        requiredOrders: 2,
        earningAmount: 40,
        startDate: days(-2),
        endDate: days(1),
        maxRedemptions: null,
        repeatable: false,
        autoCredit: true,
    },
];

const money = (n) => `₹${Number(n).toFixed(0)}`;

async function remove() {
    const filter = { title: { $regex: `^\\${SEED_TAG}` } };
    const found = await FoodEarningAddon.find(filter).select('_id title').lean();

    if (!found.length) {
        console.log('nothing to remove.');
        return;
    }

    console.log(`${found.length} demo offer(s):`);
    for (const o of found) console.log(`  - ${o.title}`);

    if (!APPLY) {
        console.log('\ndry run -- re-run with --apply to delete these and their award rows.');
        return;
    }

    const ids = found.map((o) => o._id);
    // Award rows first: a history row pointing at a deleted offer renders as a
    // blank line in the admin history table rather than disappearing.
    const awards = await FoodEarningAddonHistory.deleteMany({ offerId: { $in: ids } });
    const offers = await FoodEarningAddon.deleteMany({ _id: { $in: ids } });
    console.log(`\nremoved ${offers.deletedCount} offer(s), ${awards.deletedCount} award row(s).`);
}

async function seed() {
    console.log(`${OFFERS.length} demo offers for vertical "${VERTICAL}":\n`);

    for (const offer of OFFERS) {
        const existing = await FoodEarningAddon.findOne({ title: offer.title }).lean();
        const verb = existing ? 'update' : 'create';

        const flags = [
            offer.repeatable ? 'repeatable' : 'one-shot',
            offer.autoCredit ? 'auto-credit' : 'needs approval',
            offer.maxRedemptions ? `cap ${offer.maxRedemptions}` : 'uncapped',
        ].join(', ');

        console.log(`  ${verb.padEnd(6)} ${offer.title}`);
        console.log(
            `         ${offer.requiredOrders} deliveries -> ${money(offer.earningAmount)}  (${flags})`,
        );

        if (!APPLY) continue;

        await FoodEarningAddon.findOneAndUpdate(
            { title: offer.title },
            { $set: { ...offer, status: 'active' } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
    }

    if (!APPLY) {
        console.log('\ndry run -- nothing written. Re-run with --apply.');
        return;
    }

    console.log('\nWritten. To see them:');
    console.log('  admin  : Delivery Partners -> Earning Addon');
    console.log('  rider  : Pocket tab -> the purple incentive card');
    console.log('\nAwards land as a rider completes deliveries. To backfill for');
    console.log('riders who already qualify, press "Check Completions" in the');
    console.log('admin history page.');
}

async function main() {
    if (!VERTICALS.includes(VERTICAL)) {
        throw new Error(`--vertical must be one of ${VERTICALS.join(', ')}; got "${VERTICAL}"`);
    }
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
    console.log(`connected -> ${mongoose.connection.name}${APPLY ? '' : '  (dry run)'}\n`);

    // These collections are vertical-scoped, so the ambient scope decides both
    // which offers are read and what new ones are stamped with. Without it the
    // process default silently wins and --vertical=quick would be a lie.
    await runWithVertical(VERTICAL, async () => {
        if (REMOVE) await remove();
        else await seed();
    });

    await mongoose.disconnect();
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e.message || e);
        process.exit(1);
    });

/**
 * Repair food_restaurant_commissions.restaurantId, which was migrated as the
 * source's business code ("REST-1785218633084-7369") instead of a restaurant
 * ObjectId.
 *
 *   SOURCE_URI=... TARGET_URI=... node scripts/repair-commission-refs.js          # dry run
 *   SOURCE_URI=... TARGET_URI=... node scripts/repair-commission-refs.js --apply
 *
 * Why a separate script rather than a re-run of the migration: that migration
 * only ever inserts, never updates, so a document already in the target is left
 * exactly as it is. That rule is deliberate -- it is what makes an interrupted
 * run safe to resume without overwriting anything edited since. It also means
 * the 25 rows already written with a string cannot be fixed by running it
 * again. Correcting stored data is a repair, and repairs say so.
 *
 * The symptom this fixes: mongoose casts the query value against the schema's
 * declared ObjectId, so every admin request for the commissions list died with
 * `Cast to ObjectId failed for value "REST-..."` -- a 500, not an empty list.
 * The raw driver wrote the string without casting, which is why the bad value
 * got in at all.
 *
 * READS the source, never writes to it.
 *
 * Idempotent: rows whose restaurantId is already an ObjectId are skipped, so a
 * second run reports 0 repaired.
 */
import { MongoClient, ObjectId } from 'mongodb';

const apply = process.argv.includes('--apply');
const SOURCE_URI = process.env.SOURCE_URI;
const TARGET_URI = process.env.TARGET_URI;

const log = (...a) => console.log(...a);

const run = async () => {
    if (!SOURCE_URI || !TARGET_URI) throw new Error('SOURCE_URI and TARGET_URI must both be set');

    const sc = new MongoClient(SOURCE_URI, { serverSelectionTimeoutMS: 20000 });
    const tc = new MongoClient(TARGET_URI, { serverSelectionTimeoutMS: 20000 });
    await sc.connect(); await tc.connect();
    const S = sc.db(); const T = tc.db();

    log(`source : ${S.databaseName}  (READ ONLY)`);
    log(`target : ${T.databaseName}`);
    log(`mode   : ${apply ? 'APPLY' : 'dry run (no writes)'}\n`);

    // The source's own restaurants collection is the only thing that knows
    // which restaurant a business code belongs to. _ids carry across the
    // migration unchanged, so a source _id is already a valid target reference.
    const rests = await S.collection('restaurants')
        .find({ restaurantId: { $exists: true, $ne: '' } }, { projection: { restaurantId: 1 } })
        .toArray();
    const byCode = new Map(rests.map((r) => [String(r.restaurantId), r._id]));
    log(`source restaurants carrying a business code: ${byCode.size}`);

    const rows = await T.collection('food_restaurant_commissions').find({}).toArray();
    log(`target commission rows: ${rows.length}\n`);

    const repairs = [];
    const orphans = [];
    let alreadyOk = 0;

    for (const row of rows) {
        if (row.restaurantId instanceof ObjectId) { alreadyOk += 1; continue; }
        const code = String(row.restaurantId);
        const resolved = byCode.get(code);
        if (resolved) repairs.push({ _id: row._id, code, restaurantId: resolved });
        else orphans.push({ _id: row._id, code });
    }

    log(`already an ObjectId : ${alreadyOk}`);
    log(`resolvable          : ${repairs.length}`);
    log(`unresolvable        : ${orphans.length}`);

    if (orphans.length) {
        // Not guessed at and not silently dropped. These name a restaurant the
        // source itself no longer has, so there is nothing to point them at.
        log('\nunresolvable rows (the restaurant they name is gone from the source):');
        for (const o of orphans) log(`  ${o._id}  ${o.code}`);
        log('\nThese are MOVED to legacy_orphan_restaurant_commissions, not deleted.');
        log('A commission rate for a restaurant that does not exist configures');
        log('nothing, and leaving the string in place keeps the whole endpoint');
        log('returning 500 for every other row too -- but the row is still a record');
        log('of what was configured, so it is set aside rather than destroyed.');
    }

    if (apply) {
        for (const r of repairs) {
            await T.collection('food_restaurant_commissions')
                .updateOne({ _id: r._id }, { $set: { restaurantId: r.restaurantId } });
        }
        if (orphans.length) {
            const ids = orphans.map((o) => o._id);
            const keep = new Set(ids.map(String));
            const docs = rows
                .filter((r) => keep.has(String(r._id)))
                .map((r) => ({
                    ...r,
                    quarantinedReason: 'restaurantId names a restaurant absent from the source',
                }));
            // Copy first, remove second. The other order loses the rows outright
            // if the process dies between the two statements.
            try {
                await T.collection('legacy_orphan_restaurant_commissions')
                    .insertMany(docs, { ordered: false });
            } catch (e) {
                if (e.code !== 11000) throw e;   // already quarantined by an earlier run
            }
            await T.collection('food_restaurant_commissions').deleteMany({ _id: { $in: ids } });
        }
        log(`\nrepaired ${repairs.length}, quarantined ${orphans.length}`);
    } else {
        log('\ndry run -- nothing written. Re-run with --apply.');
    }

    await sc.close(); await tc.close();
};

run().catch((e) => { console.error(e); process.exit(1); });

/**
 * Stamp `vertical` on every document in the vertical-scoped collections.
 *
 * MUST RUN BEFORE (or with) the deploy that adds the plugin. From that deploy
 * onward every query on these collections carries `vertical: <x>`, and a
 * document without the field matches nothing: lists come back empty, lookups
 * 404, and -- worst of the three, because it is silent -- updateOne and
 * findOneAndUpdate match zero documents and report success.
 *
 * Safe to run repeatedly. It only touches documents that are missing the field,
 * so a second run reports 0 and changes nothing, and an interrupted run is
 * resumed simply by running it again.
 *
 * Each database is single-vertical until the phase 5 merge, so the whole job is
 * one updateMany per collection.
 *
 *   node scripts/backfill-vertical.js                 # dry run, counts only
 *   node scripts/backfill-vertical.js --apply         # writes, vertical from VERTICAL env
 *   node scripts/backfill-vertical.js --apply --vertical=quick
 *
 * Runs against the raw driver rather than the models on purpose: no schema
 * validation to trip over documents that predate other fields, and no chance of
 * the scoping plugin filtering the very documents this exists to find.
 */
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { VERTICALS } from '../src/core/vertical/verticalScope.js';
// Registers every model, so the scoped set below can be read off mongoose.
import '../src/routes/index.js';

/**
 * Derived from the models that actually carry the plugin, rather than written
 * out by hand.
 *
 * A hand-kept list drifts the moment a thirteenth model is scoped, and the
 * failure is silent -- that collection simply never gets backfilled, and its
 * documents go invisible on deploy. Deriving also avoids guessing collection
 * names, which are NOT the mongoose defaults here: eleven of the twelve set an
 * explicit snake_case `collection:` (food_orders, food_items, ...), so a list
 * written from model names would have missed all of them.
 */
const scopedCollections = () => mongoose
    .modelNames()
    .map((name) => mongoose.model(name))
    .filter((model) => model.schema.path('vertical'))
    .map((model) => model.collection.collectionName)
    .sort();

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const explicit = args.find((a) => a.startsWith('--vertical='))?.split('=')[1];
const vertical = (explicit || config.defaultVertical || '').trim().toLowerCase();

const run = async () => {
    if (!VERTICALS.includes(vertical)) {
        throw new Error(`vertical must be one of ${VERTICALS.join(', ')}; got "${vertical}"`);
    }
    if (!config.mongodbUri) throw new Error('MONGO_URI / MONGODB_URI is not set');

    await mongoose.connect(config.mongodbUri);
    const db = mongoose.connection.db;
    console.log(`database : ${mongoose.connection.name}`);
    console.log(`vertical : ${vertical}`);
    console.log(`mode     : ${apply ? 'APPLY (writing)' : 'dry run (no writes)'}\n`);

    const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
    let pending = 0;
    let written = 0;
    let conflicts = 0;

    for (const name of scopedCollections()) {
        if (!existing.has(name)) {
            console.log(`${name.padEnd(24)} absent, skipped`);
            continue;
        }
        const collection = db.collection(name);
        const missing = await collection.countDocuments({ vertical: { $exists: false } });
        pending += missing;

        // Documents already carrying the OTHER vertical mean this database is
        // not the single-vertical one this script assumes. Report, never
        // overwrite -- reassigning an order's vertical moves money between two
        // sets of books.
        const wrong = await collection.countDocuments({
            vertical: { $exists: true, $ne: vertical },
        });
        conflicts += wrong;

        let note = '';
        if (apply && missing > 0) {
            const result = await collection.updateMany(
                { vertical: { $exists: false } },
                { $set: { vertical } },
            );
            written += result.modifiedCount;
            note = ` -> set ${result.modifiedCount}`;
        }

        console.log(
            `${name.padEnd(24)} missing ${String(missing).padStart(8)}` +
            `${wrong ? `  OTHER-VERTICAL ${wrong}` : ''}${note}`,
        );
    }

    console.log(`\ntotal missing : ${pending}`);
    if (apply) console.log(`total written : ${written}`);
    if (conflicts) {
        console.log(
            `\nWARNING: ${conflicts} document(s) already carry a different vertical. ` +
            'This database holds more than one vertical, which this script does not ' +
            'assume. Nothing was overwritten. Investigate before deploying the scoped build.',
        );
    }
    if (!apply && pending > 0) console.log('\nRe-run with --apply to write.');

    await mongoose.disconnect();
    process.exit(conflicts ? 1 : 0);
};

run().catch((error) => {
    console.error(`backfill failed: ${error.message}`);
    process.exit(1);
});

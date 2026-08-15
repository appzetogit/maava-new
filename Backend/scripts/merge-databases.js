/**
 * Merge the quick-commerce database into the food database.
 *
 * THE IRREVERSIBLE STEP. Take a restorable backup of BOTH databases first, run
 * scripts/merge-report.js and read its CSVs, and rehearse the whole thing on a
 * scratch cluster before pointing it at production.
 *
 *   FOOD_URI=... QUICK_URI=... node scripts/merge-databases.js            # dry run
 *   FOOD_URI=... QUICK_URI=... node scripts/merge-databases.js --apply
 *
 * Food is the target and its ids never move. That is not arbitrary: leaving
 * them alone means food's own orders, wallets and tokens need no rewriting at
 * all, which roughly halves the documents this touches and therefore halves what
 * can go wrong.
 *
 * Idempotent. Every quick document is copied with `mergedFrom: 'quick'` and its
 * original _id, so a re-run skips what already landed and an interrupted run is
 * resumed by running it again. Order id prefixing is idempotent for the same
 * reason -- an already-prefixed id passes through untouched.
 *
 * Deliberately NOT wrapped in a transaction. A merge of this size exceeds what a
 * single MongoDB transaction should hold, and a half-applied transaction that
 * aborts at the end is worse than a resumable one. Idempotency is the recovery
 * mechanism; the backup is the rollback.
 */
import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';
import { IDENTITY_REFS, findUncoveredPaths, stripPositional } from '../src/core/vertical/identityRefs.js';
import { normalizePhone, normalizeEmail, planIdentityMerge, mergeWallets, prefixOrderId, sumMoney } from '../src/core/vertical/mergeIdentity.js';
import '../src/routes/index.js';

const apply = process.argv.includes('--apply');
const FOOD_URI = process.env.FOOD_URI;
const QUICK_URI = process.env.QUICK_URI;

/** Legacy unique indexes that would reject the second vertical's rows. */
const DROP_INDEXES = [
    ['food_feature_settings', 'key_1'],
    ['food_admin_wallets', 'key_1'],
    ['food_settings', 'key_1'],
    ['food_page_contents', 'key_1_module_1'],
    ['food_restaurants', 'restaurantNameNormalized_1_ownerPhoneLast10_1'],
    ['food_offers', 'couponCode_1'],
];

/** Identity collections, in the order their remaps are built. */
const IDENTITIES = [
    { kind: 'user', collection: 'food_users', keyOf: (d) => normalizePhone(d.phone || d.mobile) },
    { kind: 'rider', collection: 'food_delivery_partners', keyOf: (d) => normalizePhone(d.phone || d.mobile) },
    { kind: 'admin', collection: 'food_admins', keyOf: (d) => normalizeEmail(d.email) },
];

/** Wallets keyed by an identity, merged rather than duplicated when that identity merges. */
const WALLETS = [
    { collection: 'food_user_wallets', field: 'userId', kind: 'user' },
    { collection: 'food_delivery_wallets', field: 'deliveryPartnerId', kind: 'rider' },
];

const log = (...args) => console.log(...args);
const step = (n, title) => log(`\n=== ${n}. ${title} ===\n`);

/** Rewrite one document's identity references in place. Returns true if anything changed. */
const remapDoc = (doc, refs, remaps) => {
    let changed = false;

    const rewrite = (container, key, kind) => {
        const current = container?.[key];
        if (current === undefined || current === null) return;
        const id = String(current);
        // A null kind means the field is polymorphic (chat, notifications,
        // referral logs). Try every map; ObjectIds do not collide across
        // collections, so at most one can match.
        const maps = kind ? [remaps[kind]] : Object.values(remaps);
        for (const map of maps) {
            const target = map?.get(id);
            if (target) {
                container[key] = new mongoose.Types.ObjectId(target);
                changed = true;
                return;
            }
        }
    };

    for (const [rawPath, kind] of refs) {
        if (rawPath.includes('$[]')) {
            // Array of subdocuments: walk it explicitly.
            const [arrayPath, leaf] = rawPath.split('.$[].');
            const array = arrayPath.split('.').reduce((o, k) => o?.[k], doc);
            if (Array.isArray(array)) for (const entry of array) rewrite(entry, leaf, kind);
            continue;
        }
        const parts = stripPositional(rawPath).split('.');
        const leaf = parts.pop();
        const container = parts.reduce((o, k) => o?.[k], doc);
        if (container) rewrite(container, leaf, kind);
    }

    return changed;
};

const run = async () => {
    if (!FOOD_URI || !QUICK_URI) throw new Error('FOOD_URI and QUICK_URI must both be set');

    step(0, 'preflight');
    const gaps = findUncoveredPaths(mongoose);
    if (gaps.length) {
        log('REFUSING TO RUN. These schema paths hold an identity id and are not in IDENTITY_REFS:');
        for (const g of gaps) log(`  ${g.collection}.${g.path}`);
        log('\nMerging now would orphan every document referencing them. Add them first.');
        return 1;
    }
    log(`  IDENTITY_REFS covers every identity path in the schemas. OK.`);
    log(`  mode: ${apply ? 'APPLY (writing)' : 'dry run (no writes)'}`);

    const foodClient = new MongoClient(FOOD_URI);
    const quickClient = new MongoClient(QUICK_URI);
    await foodClient.connect();
    await quickClient.connect();
    const food = foodClient.db();
    const quick = quickClient.db();
    log(`  food : ${food.databaseName}\n  quick: ${quick.databaseName}`);

    // ---- invariant baseline -------------------------------------------------
    const walletSum = async (db) => {
        let total = 0;
        for (const { collection } of WALLETS) {
            total += sumMoney(await db.collection(collection).find({}, { projection: { balance: 1 } }).toArray());
        }
        return total;
    };
    // The baseline is FOOD only, plus whatever money this run actually moves
    // across (accumulated below).
    //
    // Not food+quick: on a resumed run quick's balances are already sitting in
    // food, so summing both double-counts them and the check reports a violation
    // for a migration that is perfectly correct. Telling an operator to restore
    // from backup when nothing is wrong is worse than not checking at all.
    const foodBefore = await walletSum(food);
    let movedMoney = 0;
    log(`  wallet balance total in food BEFORE: ${foodBefore}`);

    // ---- 1. drop blocking indexes ------------------------------------------
    step(1, 'drop legacy unique indexes');
    for (const [collection, index] of DROP_INDEXES) {
        let present = false;
        try { present = (await food.collection(collection).indexes()).some((i) => i.name === index); } catch { /* absent */ }
        if (!present) { log(`  ${collection}.${index}: absent, nothing to do`); continue; }
        if (apply) {
            await food.collection(collection).dropIndex(index);
            log(`  ${collection}.${index}: DROPPED`);
        } else {
            log(`  ${collection}.${index}: would drop`);
        }
    }

    // ---- 2. prefix order ids ------------------------------------------------
    step(2, 'prefix order ids (never renumber)');
    for (const [db, vertical] of [[food, 'food'], [quick, 'quick']]) {
        const orders = await db.collection('food_orders')
            .find({}, { projection: { order_id: 1, orderId: 1 } }).toArray();
        let changes = 0;
        for (const order of orders) {
            const next = prefixOrderId(order.order_id || order.orderId, vertical);
            if (!next || next === order.order_id) continue;
            changes += 1;
            if (apply) {
                await db.collection('food_orders').updateOne(
                    { _id: order._id },
                    { $set: { order_id: next, orderId: next } },
                );
            }
        }
        log(`  ${vertical}: ${changes} of ${orders.length} order id(s) ${apply ? 'prefixed' : 'would be prefixed'}`);
    }

    // ---- 3. build identity remaps ------------------------------------------
    step(3, 'reconcile identities');
    const remaps = {};
    const plans = {};
    for (const { kind, collection, keyOf } of IDENTITIES) {
        const [foodDocs, quickDocs] = await Promise.all([
            food.collection(collection).find({}).toArray(),
            quick.collection(collection).find({}).toArray(),
        ]);
        const plan = planIdentityMerge({ foodDocs, quickDocs, keyOf });
        remaps[kind] = plan.remap;
        plans[kind] = plan;
        log(`  ${kind.padEnd(6)} food ${String(foodDocs.length).padStart(6)}  quick ${String(quickDocs.length).padStart(6)}` +
            `  merged ${String(plan.remap.size).padStart(5)}  carried over ${plan.carryOver.length}`);
    }

    // ---- 4. copy quick documents across -------------------------------------
    step(4, 'copy quick documents into food');
    const identityCollections = new Set(IDENTITIES.map((i) => i.collection));
    const walletCollections = new Set(WALLETS.map((w) => w.collection));
    const collections = (await quick.listCollections().toArray()).map((c) => c.name).sort();

    let copied = 0;
    let skipped = 0;
    for (const name of collections) {
        if (name.startsWith('system.')) continue;
        const refs = IDENTITY_REFS[name] || [];
        const isIdentity = identityCollections.has(name);
        const isWallet = walletCollections.has(name);

        const docs = await quick.collection(name).find({}).toArray();
        if (!docs.length) continue;

        let inserted = 0;
        let merged = 0;
        let already = 0;

        for (const doc of docs) {
            // Idempotency: a document already carried across is left alone.
            const existing = await food.collection(name).findOne({ _id: doc._id }, { projection: { _id: 1 } });
            if (existing) { already += 1; continue; }

            // An identity that merged is absorbed rather than copied.
            const kind = IDENTITIES.find((i) => i.collection === name)?.kind;
            if (isIdentity && remaps[kind]?.has(String(doc._id))) { merged += 1; continue; }

            const next = { ...doc, vertical: doc.vertical || 'quick', mergedFrom: 'quick' };
            remapDoc(next, refs, remaps);

            // A wallet whose owner merged must be ADDED to the food wallet,
            // never inserted alongside it -- two wallets for one person is the
            // same as losing the money in the second one.
            if (isWallet) {
                const wallet = WALLETS.find((w) => w.collection === name);
                const ownerId = next[wallet.field];
                const target = ownerId
                    ? await food.collection(name).findOne({ [wallet.field]: ownerId })
                    : null;
                if (target) {
                    // An absorbed wallet leaves no document of its own in food --
                    // its balance was added to the target -- so the _id check
                    // above cannot see it and a second run would credit it again.
                    // The target records which source wallets it has swallowed,
                    // and that is what makes this idempotent. Without it the
                    // customer's balance grows by the merged amount every run.
                    const absorbed = (target.mergedSourceIds || []).some((id) => String(id) === String(doc._id));
                    if (absorbed) { already += 1; continue; }

                    const combined = mergeWallets(target, doc);
                    merged += 1;
                    movedMoney += Number(doc.balance) || 0;
                    if (apply) {
                        const { _id, mergedSourceIds, ...fields } = combined;
                        await food.collection(name).updateOne(
                            { _id: target._id },
                            { $set: fields, $addToSet: { mergedSourceIds: doc._id } },
                        );
                    }
                    continue;
                }
                movedMoney += Number(doc.balance) || 0;
            }

            inserted += 1;
            if (apply) await food.collection(name).insertOne(next);
        }

        copied += inserted;
        skipped += already;
        if (inserted || merged || already) {
            log(`  ${name.padEnd(40)} +${String(inserted).padStart(6)}  merged ${String(merged).padStart(5)}` +
                `  already ${String(already).padStart(5)}${refs.length ? `  (${refs.length} ref path(s) remapped)` : ''}`);
        }
    }
    log(`\n  ${apply ? 'inserted' : 'would insert'} ${copied} document(s); ${skipped} already present`);

    // ---- 5. verify the invariant -------------------------------------------
    step(5, 'verify');
    const expected = foodBefore + movedMoney;
    if (apply) {
        const after = await walletSum(food);
        log(`  food balance before          : ${foodBefore}`);
        log(`  balance moved across this run: ${movedMoney}`);
        log(`  expected after               : ${expected}`);
        log(`  actual after                 : ${after}`);
        if (Math.abs(after - expected) > 0.005) {
            log('\n  INVARIANT VIOLATED. The merge moved money. Restore from backup;');
            log('  do not investigate this in production.');
            await foodClient.close(); await quickClient.close();
            return 1;
        }
        log('  balances reconcile.');
    } else {
        log(`  food balance before          : ${foodBefore}`);
        log(`  balance that would move      : ${movedMoney}`);
        log(`  expected after apply         : ${expected}`);
        log('  dry run -- nothing written. Re-run with --apply.');
    }

    await foodClient.close();
    await quickClient.close();
    return 0;
};

run()
    .then((code) => process.exit(code))
    .catch((error) => {
        console.error(`\nmerge failed: ${error.message}\n${error.stack}`);
        process.exit(1);
    });

/**
 * Read-only reconciliation report for the two-database merge.
 *
 * WRITES NOTHING. Run this first, read the CSVs, and only then decide whether
 * the migration is safe to run. Every collision it lists is a decision someone
 * has to make -- the same customer signed up in both apps, the same rider
 * onboarded twice, two sellers that share a name and a phone. Automating those
 * decisions without looking at them is how a merge loses money.
 *
 *   FOOD_URI=mongodb://.../food QUICK_URI=mongodb://.../quick \
 *     node scripts/merge-report.js --out ./merge-report
 *
 * Sections:
 *   1  schema audit      -- every place an identity id is stored, and whether
 *                           IDENTITY_REFS covers it. Runs with no database.
 *   2  identity overlap  -- users, riders, admins, sellers present on both sides
 *   3  order id overlap  -- human-readable ids that collide
 *   4  blocking indexes  -- legacy unique indexes that will reject the merge
 *   5  invariants        -- the money and count totals to compare afterwards
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';
import { IDENTITY_REFS, findUncoveredPaths, auditIdentityPaths } from '../src/core/vertical/identityRefs.js';
import { normalizePhone, normalizeEmail, pairByKey, sumMoney } from '../src/core/vertical/mergeIdentity.js';
import '../src/routes/index.js';

const args = process.argv.slice(2);
const outDir = args.find((a) => a.startsWith('--out='))?.split('=')[1]
    || (args.includes('--out') ? args[args.indexOf('--out') + 1] : './merge-report');

const FOOD_URI = process.env.FOOD_URI;
const QUICK_URI = process.env.QUICK_URI;

const csv = (rows) => rows
    .map((row) => row.map((cell) => {
        const value = cell === null || cell === undefined ? '' : String(cell);
        return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }).join(','))
    .join('\n');

const write = (name, rows) => {
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, name);
    fs.writeFileSync(file, csv(rows), 'utf8');
    console.log(`  wrote ${file}  (${Math.max(0, rows.length - 1)} rows)`);
};

/** Legacy single-field unique indexes that phases 2 and 3 deliberately left in place. */
const BLOCKING_INDEXES = [
    ['food_feature_settings', 'key_1'],
    ['food_admin_wallets', 'key_1'],
    ['food_settings', 'key_1'],
    ['food_page_contents', 'key_1_module_1'],
    ['food_restaurants', 'restaurantNameNormalized_1_ownerPhoneLast10_1'],
    ['food_orders', 'order_id_1'],
    ['food_orders', 'orderId_1'],
    ['food_offers', 'couponCode_1'],
];

const overlapReport = async ({ foodDb, quickDb, collection, keyOf, label, columns }) => {
    const [foodDocs, quickDocs] = await Promise.all([
        foodDb.collection(collection).find({}).toArray(),
        quickDb.collection(collection).find({}).toArray(),
    ]);
    const { pairs, unkeyed } = pairByKey(foodDocs, quickDocs, keyOf);

    const both = [...pairs.values()].filter((p) => p.food && p.quick);
    const dupes = [...pairs.values()].filter((p) => p.duplicates?.length);

    const rows = [['key', 'side', '_id', ...columns.map(([name]) => name)]];
    const push = (side, doc, key) => rows.push([
        key, side, String(doc._id), ...columns.map(([, get]) => get(doc)),
    ]);
    for (const p of both) { push('food', p.food, p.key); push('quick', p.quick, p.key); }
    for (const p of dupes) for (const d of p.duplicates) push(`${d.side}-DUPLICATE`, d.doc, p.key);
    for (const doc of unkeyed.food) push('food-UNKEYED', doc, '');
    for (const doc of unkeyed.quick) push('quick-UNKEYED', doc, '');

    write(`${label}.csv`, rows);
    return {
        label,
        food: foodDocs.length,
        quick: quickDocs.length,
        both: both.length,
        withinSideDuplicates: dupes.length,
        unkeyed: unkeyed.food.length + unkeyed.quick.length,
        foodDocs,
        quickDocs,
    };
};

const run = async () => {
    console.log('\n=== 1. schema audit (no database needed) ===\n');
    const audit = auditIdentityPaths(mongoose);
    const auditRows = [['collection', 'path', 'declared_ref', 'found_by', 'covered_by_IDENTITY_REFS']];
    const gaps = findUncoveredPaths(mongoose);
    const gapKeys = new Set(gaps.map((g) => `${g.collection}.${g.path}`));
    for (const [collection, entries] of Object.entries(audit)) {
        for (const entry of entries) {
            auditRows.push([
                collection,
                entry.path,
                entry.ref || '(none)',
                entry.byRef ? (entry.byName ? 'ref+name' : 'ref') : 'name only',
                gapKeys.has(`${collection}.${entry.path}`) ? 'NO - GAP' : 'yes',
            ]);
        }
    }
    write('identity-paths.csv', auditRows);
    console.log(`  ${auditRows.length - 1} identity paths across ${Object.keys(audit).length} collections`);
    console.log(`  covered by IDENTITY_REFS: ${auditRows.length - 1 - gaps.length}, GAPS: ${gaps.length}`);
    if (gaps.length) {
        console.log('\n  STOP. These paths hold an identity id and the migration does not know about them.');
        for (const g of gaps) console.log(`    ${g.collection}.${g.path}`);
    }
    const refless = Object.values(audit).flat().filter((e) => !e.byRef);
    if (refless.length) {
        console.log(`\n  ${refless.length} path(s) are found ONLY by name -- they declare no usable ref,`);
        console.log('  so any migration written from declared refs alone would skip them.');
    }

    if (!FOOD_URI || !QUICK_URI) {
        console.log('\nFOOD_URI and QUICK_URI not set -- stopping after the schema audit.');
        console.log('Set both to run the collision and invariant sections.\n');
        return gaps.length ? 1 : 0;
    }

    const foodClient = new MongoClient(FOOD_URI);
    const quickClient = new MongoClient(QUICK_URI);
    await foodClient.connect();
    await quickClient.connect();
    const foodDb = foodClient.db();
    const quickDb = quickClient.db();
    console.log(`\nfood : ${foodDb.databaseName}\nquick: ${quickDb.databaseName}`);

    console.log('\n=== 2. identity overlap ===\n');
    const summaries = [];
    summaries.push(await overlapReport({
        foodDb, quickDb, collection: 'food_users', label: 'users-by-phone',
        keyOf: (d) => normalizePhone(d.phone || d.mobile),
        columns: [['name', (d) => d.name], ['phone', (d) => d.phone], ['createdAt', (d) => d.createdAt]],
    }));
    summaries.push(await overlapReport({
        foodDb, quickDb, collection: 'food_delivery_partners', label: 'riders-by-phone',
        keyOf: (d) => normalizePhone(d.phone || d.mobile),
        columns: [['name', (d) => d.name], ['phone', (d) => d.phone]],
    }));
    summaries.push(await overlapReport({
        foodDb, quickDb, collection: 'food_admins', label: 'admins-by-email',
        keyOf: (d) => normalizeEmail(d.email),
        columns: [['name', (d) => d.name], ['email', (d) => d.email], ['adminType', (d) => d.adminType]],
    }));
    summaries.push(await overlapReport({
        foodDb, quickDb, collection: 'food_restaurants', label: 'sellers-by-name-phone',
        keyOf: (d) => {
            const name = String(d.restaurantNameNormalized || d.restaurantName || '').trim().toLowerCase();
            const phone = normalizePhone(d.ownerPhoneLast10 || d.ownerPhone);
            return name && phone ? `${name}|${phone}` : '';
        },
        columns: [['restaurantName', (d) => d.restaurantName], ['ownerPhone', (d) => d.ownerPhone], ['status', (d) => d.status]],
    }));

    console.log('\n=== 3. order id overlap ===\n');
    const idsOf = async (db) => {
        const docs = await db.collection('food_orders')
            .find({}, { projection: { order_id: 1, orderId: 1, createdAt: 1 } }).toArray();
        return new Map(docs.filter((d) => d.order_id || d.orderId)
            .map((d) => [String(d.order_id || d.orderId), d]));
    };
    const [foodIds, quickIds] = await Promise.all([idsOf(foodDb), idsOf(quickDb)]);
    const clashes = [...quickIds.keys()].filter((id) => foodIds.has(id));
    write('order-id-collisions.csv', [
        ['order_id', 'food_mongo_id', 'quick_mongo_id'],
        ...clashes.map((id) => [id, String(foodIds.get(id)._id), String(quickIds.get(id)._id)]),
    ]);
    console.log(`  food orders: ${foodIds.size}, quick orders: ${quickIds.size}, colliding ids: ${clashes.length}`);
    console.log('  (collisions are resolved by the FD-/QC- prefix, not by renumbering)');

    console.log('\n=== 4. blocking indexes ===\n');
    const indexRows = [['database', 'collection', 'index', 'present', 'action']];
    for (const [db, side] of [[foodDb, 'food'], [quickDb, 'quick']]) {
        for (const [collection, index] of BLOCKING_INDEXES) {
            let present = false;
            try {
                present = (await db.collection(collection).indexes()).some((i) => i.name === index);
            } catch { /* collection absent */ }
            indexRows.push([side, collection, index, present ? 'YES' : 'no', present ? 'DROP before merge' : '-']);
        }
    }
    write('blocking-indexes.csv', indexRows);
    console.log(`  ${indexRows.filter((r) => r[3] === 'YES').length} legacy unique index(es) present and blocking`);

    console.log('\n=== 5. invariants (compare these after the merge) ===\n');
    const walletTotals = async (db, collection, field) => sumMoney(
        await db.collection(collection).find({}, { projection: { [field]: 1 } }).toArray(), field,
    );
    const invariantRows = [['metric', 'food', 'quick', 'expected_after_merge']];
    for (const [collection, field] of [
        ['food_user_wallets', 'balance'],
        ['food_restaurant_wallets', 'balance'],
        ['food_delivery_wallets', 'balance'],
        ['food_delivery_wallets', 'cashInHand'],
        ['food_admin_wallets', 'balance'],
    ]) {
        const a = await walletTotals(foodDb, collection, field);
        const b = await walletTotals(quickDb, collection, field);
        invariantRows.push([`sum(${collection}.${field})`, a, b, a + b]);
    }
    for (const collection of ['food_orders', 'food_users', 'food_restaurants', 'food_items', 'transactions']) {
        const a = await foodDb.collection(collection).countDocuments().catch(() => 0);
        const b = await quickDb.collection(collection).countDocuments().catch(() => 0);
        const merged = collection === 'food_users'
            ? `${a + b} minus ${summaries[0].both} merged`
            : a + b;
        invariantRows.push([`count(${collection})`, a, b, merged]);
    }
    write('invariants.csv', invariantRows);

    console.log('\n=== summary ===\n');
    for (const s of summaries) {
        console.log(`  ${s.label.padEnd(24)} food ${String(s.food).padStart(7)}  quick ${String(s.quick).padStart(7)}` +
            `  BOTH ${String(s.both).padStart(6)}  in-side dupes ${s.withinSideDuplicates}  unkeyed ${s.unkeyed}`);
    }
    console.log(`\n  The sum of every wallet balance is the invariant. If it moves by any`);
    console.log(`  amount across the migration, roll back rather than investigate in production.\n`);

    await foodClient.close();
    await quickClient.close();
    return gaps.length ? 1 : 0;
};

run()
    .then((code) => process.exit(code))
    .catch((error) => {
        console.error(`\nmerge-report failed: ${error.message}`);
        process.exit(1);
    });

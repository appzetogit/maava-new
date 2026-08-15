/**
 * End-to-end rehearsal of the database merge against a real mongod.
 *
 * Seeds two databases with the collisions the report is designed to find -- the
 * same customer in both apps with money in both wallets, a rider onboarded
 * twice, colliding order numbers, a legacy unique index -- runs the migration,
 * and asserts the things that must be true afterwards.
 *
 * The headline assertion is the wallet total. Everything else about a merge can
 * be corrected later; money that moved cannot.
 *
 *   node --test scripts/merge.integration.test.js
 *
 * Requires mongodb-memory-server (dev only, not a runtime dependency):
 *   npm i --no-save mongodb-memory-server
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { MongoClient, ObjectId } from 'mongodb';

let server;
let client;
let FOOD_URI;
let QUICK_URI;

const oid = (hex) => new ObjectId(hex.padEnd(24, '0'));

// One person, both apps, money in both wallets.
const SHARED_USER_FOOD = oid('a1');
const SHARED_USER_QUICK = oid('b1');
// One rider, both apps.
const SHARED_RIDER_FOOD = oid('a2');
const SHARED_RIDER_QUICK = oid('b2');
// Quick-only customer.
const QUICK_ONLY_USER = oid('b3');

const seed = async () => {
    const food = client.db('fq_food');
    const quick = client.db('fq_quick');

    await food.collection('food_users').insertMany([
        { _id: SHARED_USER_FOOD, name: 'Asha', phone: '+91 98765 43210', vertical: 'food' },
        { _id: oid('a9'), name: 'Food Only', phone: '9000000001', vertical: 'food' },
    ]);
    await quick.collection('food_users').insertMany([
        { _id: SHARED_USER_QUICK, name: 'Asha K', phone: '919876543210', vertical: 'quick' },
        { _id: QUICK_ONLY_USER, name: 'Quick Only', phone: '9000000002', vertical: 'quick' },
    ]);

    await food.collection('food_delivery_partners').insertOne(
        { _id: SHARED_RIDER_FOOD, name: 'Ravi', phone: '9811111111', vertical: 'food' });
    await quick.collection('food_delivery_partners').insertOne(
        { _id: SHARED_RIDER_QUICK, name: 'Ravi S', phone: '+91 98111 11111', vertical: 'quick' });

    // Wallets: 200 + 150 must become 350, not 150.
    await food.collection('food_user_wallets').insertOne(
        { userId: SHARED_USER_FOOD, balance: 200, referralEarnings: 10, transactions: [] });
    await quick.collection('food_user_wallets').insertMany([
        { userId: SHARED_USER_QUICK, balance: 150, referralEarnings: 5, transactions: [] },
        { userId: QUICK_ONLY_USER, balance: 75, transactions: [] },
    ]);
    await food.collection('food_delivery_wallets').insertOne(
        { deliveryPartnerId: SHARED_RIDER_FOOD, balance: 500, cashInHand: 40 });
    await quick.collection('food_delivery_wallets').insertOne(
        { deliveryPartnerId: SHARED_RIDER_QUICK, balance: 300, cashInHand: 60 });

    // Colliding human-readable order ids, and a rider reference buried in a
    // subdocument -- the path schema.eachPath() cannot see.
    await food.collection('food_orders').insertOne({
        _id: oid('c1'), order_id: '1001', orderId: '1001', userId: SHARED_USER_FOOD,
        dispatch: { deliveryPartnerId: SHARED_RIDER_FOOD, offeredTo: [] }, vertical: 'food',
    });
    await quick.collection('food_orders').insertMany([
        {
            _id: oid('d1'), order_id: '1001', orderId: '1001', userId: SHARED_USER_QUICK,
            dispatch: {
                deliveryPartnerId: SHARED_RIDER_QUICK,
                offeredTo: [{ partnerId: SHARED_RIDER_QUICK, action: 'offered' }],
            },
            statusHistory: [{ byId: SHARED_USER_QUICK, status: 'placed' }],
            vertical: 'quick',
        },
        {
            _id: oid('d2'), order_id: '1002', orderId: '1002', userId: QUICK_ONLY_USER,
            dispatch: { deliveryPartnerId: null, offeredTo: [] }, vertical: 'quick',
        },
    ]);

    await quick.collection('food_user_carts').insertOne(
        { _id: oid('d5'), userId: SHARED_USER_QUICK, items: [], vertical: 'quick' });

    // A legacy unique index that would reject the second vertical's row.
    await food.collection('food_feature_settings').insertOne(
        { key: 'dining', isEnabled: true, vertical: 'food' });
    await food.collection('food_feature_settings').createIndex({ key: 1 }, { unique: true, name: 'key_1' });
    await quick.collection('food_feature_settings').insertOne(
        { _id: oid('d7'), key: 'dining', isEnabled: false, vertical: 'quick' });
};

const runMerge = (extraArgs = []) => spawnSync(
    process.execPath,
    ['scripts/merge-databases.js', ...extraArgs],
    { cwd: process.cwd(), env: { ...process.env, FOOD_URI, QUICK_URI }, encoding: 'utf8' },
);

before(async () => {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    server = await MongoMemoryServer.create();
    const uri = server.getUri();
    FOOD_URI = `${uri}fq_food`;
    QUICK_URI = `${uri}fq_quick`;
    client = new MongoClient(uri);
    await client.connect();
    await seed();
});

after(async () => {
    await client?.close();
    await server?.stop();
});

test('dry run writes absolutely nothing', async () => {
    const before = await client.db('fq_food').collection('food_users').countDocuments();
    const result = runMerge();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /dry run/);
    assert.equal(await client.db('fq_food').collection('food_users').countDocuments(), before);
    // The order ids must be untouched too.
    const order = await client.db('fq_food').collection('food_orders').findOne({ _id: oid('c1') });
    assert.equal(order.order_id, '1001', 'dry run must not prefix');
});

test('the merge applies and the wallet total is preserved exactly', async () => {
    const result = runMerge(['--apply']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /balances reconcile/);

    const wallets = await client.db('fq_food').collection('food_user_wallets').find({}).toArray();
    const riders = await client.db('fq_food').collection('food_delivery_wallets').find({}).toArray();
    const total = [...wallets, ...riders].reduce((n, w) => n + Number(w.balance || 0), 0);
    // 200 + 150 + 75 (users) + 500 + 300 (riders)
    assert.equal(total, 1225, 'not one paisa may move');
});

test('the shared customer ends with ONE wallet holding the sum', async () => {
    const wallets = await client.db('fq_food').collection('food_user_wallets')
        .find({ userId: SHARED_USER_FOOD }).toArray();
    assert.equal(wallets.length, 1, 'two wallets for one person is money lost');
    assert.equal(wallets[0].balance, 350);
    assert.equal(wallets[0].referralEarnings, 15);
});

test('the shared rider wallet sums balance AND cash in hand', async () => {
    const wallet = await client.db('fq_food').collection('food_delivery_wallets')
        .findOne({ deliveryPartnerId: SHARED_RIDER_FOOD });
    assert.equal(wallet.balance, 800);
    assert.equal(wallet.cashInHand, 100, 'cash owed to the company must not be dropped');
});

test('the duplicate identity is absorbed, not copied', async () => {
    const users = await client.db('fq_food').collection('food_users').find({}).toArray();
    assert.equal(users.length, 3, 'Asha(1) + FoodOnly + QuickOnly');
    assert.equal(await client.db('fq_food').collection('food_users')
        .countDocuments({ _id: SHARED_USER_QUICK }), 0, 'the quick copy must not survive');
});

test('references are remapped, including inside subdocuments and arrays', async () => {
    const order = await client.db('fq_food').collection('food_orders').findOne({ _id: oid('d1') });
    assert.equal(String(order.userId), String(SHARED_USER_FOOD), 'top-level ref');
    assert.equal(String(order.dispatch.deliveryPartnerId), String(SHARED_RIDER_FOOD),
        'subdocument ref -- the one eachPath cannot see');
    assert.equal(String(order.dispatch.offeredTo[0].partnerId), String(SHARED_RIDER_FOOD),
        'ref inside an array of subdocuments');
    assert.equal(String(order.statusHistory[0].byId), String(SHARED_USER_FOOD),
        'polymorphic ref inside an array');

    const cart = await client.db('fq_food').collection('food_user_carts').findOne({ _id: oid('d5') });
    assert.equal(String(cart.userId), String(SHARED_USER_FOOD));
});

test('order ids are prefixed on both sides so the collision resolves', async () => {
    const foodOrder = await client.db('fq_food').collection('food_orders').findOne({ _id: oid('c1') });
    const quickOrder = await client.db('fq_food').collection('food_orders').findOne({ _id: oid('d1') });
    assert.equal(foodOrder.order_id, 'FD-1001');
    assert.equal(quickOrder.order_id, 'QC-1001');
    assert.notEqual(foodOrder.order_id, quickOrder.order_id);
    // The alias must move with it, or the rogue orderId_1 index still collides.
    assert.equal(quickOrder.orderId, 'QC-1001');
});

test('the legacy unique index is dropped so both verticals coexist', async () => {
    const indexes = await client.db('fq_food').collection('food_feature_settings').indexes();
    assert.ok(!indexes.some((i) => i.name === 'key_1'), 'key_1 must be gone');
    const flags = await client.db('fq_food').collection('food_feature_settings')
        .find({ key: 'dining' }).toArray();
    assert.equal(flags.length, 2, 'one dining flag per vertical');
    assert.deepEqual(flags.map((f) => f.vertical).sort(), ['food', 'quick']);
});

test('carried-over documents are tagged so the merge is auditable', async () => {
    const order = await client.db('fq_food').collection('food_orders').findOne({ _id: oid('d2') });
    assert.equal(order.mergedFrom, 'quick');
    assert.equal(order.vertical, 'quick');
});

test('re-running changes nothing -- the migration is idempotent', async () => {
    const snapshot = async () => ({
        users: await client.db('fq_food').collection('food_users').countDocuments(),
        orders: await client.db('fq_food').collection('food_orders').countDocuments(),
        wallet: (await client.db('fq_food').collection('food_user_wallets')
            .findOne({ userId: SHARED_USER_FOOD })).balance,
        ids: (await client.db('fq_food').collection('food_orders').find({}).toArray())
            .map((o) => o.order_id).sort(),
    });

    const first = await snapshot();
    const result = runMerge(['--apply']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const second = await snapshot();

    assert.deepEqual(second, first, 'a second run must be a no-op -- no double-prefixing, no double-crediting');
    assert.equal(second.wallet, 350, 'the balance must NOT become 500');
});

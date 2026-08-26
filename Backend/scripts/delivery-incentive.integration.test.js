/**
 * Proves delivery incentives actually award, exactly once, against a real mongod.
 *
 * The parts worth pinning are the ones that were wrong before: the award path
 * counted orders by when they were PLACED rather than delivered, never enforced
 * maxRedemptions, and deduped with a read-then-write that two concurrent
 * deliveries both won. None of those are visible in a single-threaded happy path
 * -- they need a real database, real indexes, and real concurrency.
 *
 *   node --test scripts/delivery-incentive.integration.test.js
 *
 * Needs mongodb-memory-server (dev only):  npm i --no-save mongodb-memory-server
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { runWithVertical, CROSS_VERTICAL } from '../src/core/vertical/verticalScope.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import { FoodEarningAddon } from '../src/modules/food/admin/models/earningAddon.model.js';
import { FoodEarningAddonHistory } from '../src/modules/food/admin/models/earningAddonHistory.model.js';
import {
    evaluateIncentivesForPartner,
    earnedCycles,
} from '../src/modules/food/delivery/services/deliveryIncentive.service.js';

let server;

const RIDER = new mongoose.Types.ObjectId();

const WINDOW_START = new Date('2026-01-01T00:00:00.000Z');
const WINDOW_END = new Date('2026-01-31T23:59:59.999Z');
const INSIDE = new Date('2026-01-15T12:00:00.000Z');
const OUTSIDE = new Date('2025-12-20T12:00:00.000Z');

const unscoped = (q) => q.setOptions({ skipVerticalScope: true });

const offer = (extra = {}) => ({
    vertical: 'food',
    title: 'Complete 5 deliveries',
    requiredOrders: 5,
    earningAmount: 100,
    startDate: WINDOW_START,
    endDate: WINDOW_END,
    status: 'active',
    repeatable: false,
    autoCredit: false,
    ...extra,
});

/**
 * A delivered order. `deliveredAt` and `createdAt` are set independently so the
 * window tests can drive them apart -- that difference is the whole point of one
 * of the bugs below.
 */
const delivered = async (vertical, deliveredAt, createdAt = deliveredAt) => {
    const [doc] = await FoodOrder.create([{
        vertical,
        userId: new mongoose.Types.ObjectId(),
        restaurantId: new mongoose.Types.ObjectId(),
        items: [{ itemId: 'i1', name: 'thing', price: 10, quantity: 1 }],
        deliveryAddress: {
            street: 's', city: 'c', state: 'st',
            // The collection carries a 2dsphere index, so an address without
            // real coordinates is rejected at insert.
            location: { type: 'Point', coordinates: [75.87, 22.72] },
        },
        pricing: { subtotal: 10, total: 10 },
        payment: { method: 'cash' },
        orderStatus: 'delivered',
        dispatch: { status: 'accepted', deliveryPartnerId: RIDER },
        deliveryState: { deliveredAt },
    }], { timestamps: false });
    // Straight through the driver: mongoose marks `createdAt` immutable, so it
    // silently strips it from a normal update and the backdating never lands.
    await FoodOrder.collection.updateOne({ _id: doc._id }, { $set: { createdAt } });
    return doc;
};

const deliverN = async (n, vertical = 'food', at = INSIDE) => {
    for (let i = 0; i < n; i += 1) await delivered(vertical, at);
};

const evaluate = (vertical = 'food') =>
    evaluateIncentivesForPartner(String(RIDER), { vertical, now: INSIDE });

const historyRows = () =>
    unscoped(FoodEarningAddonHistory.find({ deliveryPartnerId: RIDER }).sort({ cycle: 1 })).lean();

before(async () => {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri('incentives'));
    // The unique index on history IS the concurrency lock, so the tests are
    // meaningless unless it is actually built.
    await FoodEarningAddonHistory.syncIndexes();
});

after(async () => {
    await mongoose.disconnect();
    await server?.stop();
});

beforeEach(async () => {
    await unscoped(FoodOrder.deleteMany({}));
    await unscoped(FoodEarningAddon.deleteMany({}));
    await unscoped(FoodEarningAddonHistory.deleteMany({}));
});

test('nothing is awarded below the threshold', async () => {
    await FoodEarningAddon.create([offer()]);
    await deliverN(4);

    const result = await evaluate();
    assert.equal(result.awarded, 0);
    assert.equal((await historyRows()).length, 0);
});

test('the award lands on the qualifying delivery', async () => {
    await FoodEarningAddon.create([offer()]);
    await deliverN(5);

    const result = await evaluate();
    assert.equal(result.awarded, 1);

    const rows = await historyRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].earningAmount, 100);
    assert.equal(rows[0].cycle, 0);
    assert.equal(rows[0].status, 'pending', 'autoCredit off leaves it for admin approval');
});

test('re-evaluating does not pay twice', async () => {
    await FoodEarningAddon.create([offer()]);
    await deliverN(12);

    await evaluate();
    await evaluate();
    const again = await evaluate();

    assert.equal(again.awarded, 0);
    assert.equal((await historyRows()).length, 1, 'a one-shot offer stays at one row');
});

test('a repeatable offer pays each further multiple, and only completed ones', async () => {
    await FoodEarningAddon.create([offer({ repeatable: true })]);
    await deliverN(5);
    assert.equal((await evaluate()).awarded, 1);

    // Four more: 9 deliveries is still only one completed cycle.
    await deliverN(4);
    assert.equal((await evaluate()).awarded, 0, '9 deliveries has not finished cycle 2');

    await deliverN(1);
    assert.equal((await evaluate()).awarded, 1, '10 deliveries completes cycle 2');

    const rows = await historyRows();
    assert.deepEqual(rows.map((r) => r.cycle), [0, 1]);
    assert.equal(rows.length, 2);
});

test('concurrent deliveries award exactly once', async () => {
    // The original read-then-create race. Ten evaluations firing together all
    // saw "no history row yet" and all paid.
    await FoodEarningAddon.create([offer()]);
    await deliverN(5);

    const results = await Promise.all(Array.from({ length: 10 }, () => evaluate()));
    const totalAwarded = results.reduce((sum, r) => sum + r.awarded, 0);

    assert.equal(totalAwarded, 1, 'exactly one of ten concurrent evaluations may pay');
    assert.equal((await historyRows()).length, 1);

    const live = await unscoped(FoodEarningAddon.findOne({ title: offer().title })).lean();
    assert.equal(live.currentRedemptions, 1, 'losers must release the slot they reserved');
});

test('maxRedemptions is enforced when awarding, not just when listing', async () => {
    // It was checked only where offers are shown to riders, so a capped offer
    // paid everyone who qualified.
    await FoodEarningAddon.create([offer({ maxRedemptions: 1, currentRedemptions: 1 })]);
    await deliverN(5);

    const result = await evaluate();
    assert.equal(result.awarded, 0);
    assert.equal((await historyRows()).length, 0, 'an exhausted cap pays nobody');
});

test('deliveries are counted by when they were DELIVERED, not placed', async () => {
    await FoodEarningAddon.create([offer()]);

    // Placed inside the window, handed over after it closed. The offer asks
    // about completed deliveries, so these must not count.
    for (let i = 0; i < 5; i += 1) {
        await delivered('food', new Date('2026-02-05T12:00:00.000Z'), INSIDE);
    }
    assert.equal((await evaluate()).awarded, 0, 'delivered after the window must not count');

    // Placed before the window opened, delivered inside it. These DO count.
    for (let i = 0; i < 5; i += 1) await delivered('food', INSIDE, OUTSIDE);
    assert.equal((await evaluate()).awarded, 1, 'delivered inside the window counts');
});

test('legacy orders with no deliveredAt fall back to createdAt', async () => {
    await FoodEarningAddon.create([offer()]);
    for (let i = 0; i < 5; i += 1) {
        const doc = await delivered('food', INSIDE);
        await FoodOrder.collection.updateOne({ _id: doc._id }, { $unset: { 'deliveryState.deliveredAt': '' } });
    }

    assert.equal((await evaluate()).awarded, 1, 'pre-deploy orders must still count');
});

test('a food delivery never awards a quick-commerce offer', async () => {
    await FoodEarningAddon.create([offer({ vertical: 'quick', title: 'Grocery push' })]);
    await deliverN(5, 'food');

    assert.equal((await evaluate('food')).awarded, 0, 'wrong vertical must not pay');

    // And the rider's grocery runs pay the grocery offer.
    await deliverN(5, 'quick');
    assert.equal((await evaluate('quick')).awarded, 1);
});

test('the cross-vertical rider scope does not leak offers across verticals', async () => {
    // Rider routes run under CROSS_VERTICAL, where the scoping plugin stops
    // filtering. If the service inherited that instead of naming its vertical,
    // one delivery would evaluate both verticals' offers at once.
    await FoodEarningAddon.create([
        offer({ vertical: 'food', title: 'Food five' }),
        offer({ vertical: 'quick', title: 'Quick five' }),
    ]);
    await deliverN(5, 'food');

    const result = await runWithVertical(CROSS_VERTICAL, () => evaluate('food'));
    assert.equal(result.awarded, 1);

    const rows = await historyRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].vertical, 'food', 'the row must be stamped food, not the process default');
});

test('an inactive or out-of-window offer pays nothing', async () => {
    await FoodEarningAddon.create([
        offer({ status: 'inactive', title: 'Paused' }),
        offer({ title: 'Expired', startDate: new Date('2025-01-01'), endDate: new Date('2025-02-01') }),
    ]);
    await deliverN(10);

    assert.equal((await evaluate()).awarded, 0);
});

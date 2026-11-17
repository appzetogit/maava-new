/**
 * Proves the vertical plugin actually filters, against a real mongod.
 *
 * The unit tests cover the pure pipeline logic and the AsyncLocalStorage
 * propagation. Neither exercises the mongoose hooks themselves -- whether a
 * find() really is narrowed, whether an aggregate really is prefixed, whether
 * the cross-vertical scope really does lift the filter. Those are the parts a
 * data leak or a double-assigned rider would come from.
 *
 *   node --test scripts/vertical-scope.integration.test.js
 *
 * Needs mongodb-memory-server (dev only):  npm i --no-save mongodb-memory-server
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { runWithVertical, CROSS_VERTICAL } from '../src/core/vertical/verticalScope.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import { getBusyDeliveryPartnerIds } from '../src/modules/food/orders/services/order.helpers.js';

let server;

const RIDER = new mongoose.Types.ObjectId();
const CUSTOMER = new mongoose.Types.ObjectId();

const order = (vertical, extra = {}) => ({
    vertical,
    userId: CUSTOMER,
    restaurantId: new mongoose.Types.ObjectId(),
    items: [{ itemId: 'i1', name: 'thing', price: 10, quantity: 1 }],
    deliveryAddress: { street: 's', city: 'c', state: 'st' },
    pricing: { subtotal: 10, total: 10 },
    payment: { method: 'cash' },
    orderStatus: 'confirmed',
    ...extra,
});

before(async () => {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri('vscope'));

    // Two orders per vertical for the same customer; the food one is out with a
    // rider, so "is this rider busy" must be true in BOTH verticals.
    await FoodOrder.create(order('food', {
        dispatch: { status: 'accepted', deliveryPartnerId: RIDER },
    }));
    await FoodOrder.create(order('quick'));
});

after(async () => {
    await mongoose.disconnect();
    await server?.stop();
});

test('a scoped find sees only its own vertical', async () => {
    const food = await runWithVertical('food', async () => FoodOrder.find({ userId: CUSTOMER }).lean());
    const quick = await runWithVertical('quick', async () => FoodOrder.find({ userId: CUSTOMER }).lean());

    assert.equal(food.length, 1);
    assert.equal(food[0].vertical, 'food');
    assert.equal(quick.length, 1);
    assert.equal(quick[0].vertical, 'quick');
});

test('countDocuments is scoped too', async () => {
    assert.equal(await runWithVertical('food', async () => FoodOrder.countDocuments({ userId: CUSTOMER })), 1);
});

test('an aggregate is prefixed with a $match on vertical', async () => {
    const rows = await runWithVertical('quick', async () => FoodOrder.aggregate([
        { $match: { userId: CUSTOMER } },
        { $group: { _id: '$vertical', n: { $sum: 1 } } },
    ]));
    assert.deepEqual(rows, [{ _id: 'quick', n: 1 }]);
});

test('skipVerticalScope lifts the filter -- the customer sees one history', async () => {
    // This is the cross-vertical order history: one phone, one wallet, one list.
    const all = await runWithVertical('food', async () => FoodOrder
        .find({ userId: CUSTOMER })
        .setOptions({ skipVerticalScope: true })
        .lean());
    assert.equal(all.length, 2);
    assert.deepEqual(all.map((o) => o.vertical).sort(), ['food', 'quick']);
});

test('an explicit vertical in the caller filter is not overridden', async () => {
    const rows = await runWithVertical('food', async () => FoodOrder.find({ userId: CUSTOMER, vertical: 'quick' }).lean());
    assert.equal(rows.length, 1);
    assert.equal(rows[0].vertical, 'quick');
});

test('the CROSS_VERTICAL scope sees both verticals', async () => {
    const rows = await runWithVertical(CROSS_VERTICAL, async () => FoodOrder.find({ userId: CUSTOMER }).lean());
    assert.equal(rows.length, 2, 'rider routes run in this scope');
});

test('CROSS_VERTICAL also lifts the aggregate filter', async () => {
    const rows = await runWithVertical(CROSS_VERTICAL, async () => FoodOrder.aggregate([
        { $match: { userId: CUSTOMER } },
        { $group: { _id: null, n: { $sum: 1 } } },
    ]));
    assert.equal(rows[0].n, 2);
});

test('a busy rider is busy in EVERY vertical', async () => {
    // The bug this guards: dispatching a grocery order under the 'quick' scope
    // could not see that the rider was already out with a dinner order, and
    // handed them a second one.
    const seenFromQuick = await runWithVertical('quick', async () => getBusyDeliveryPartnerIds());
    assert.ok(
        seenFromQuick.has(String(RIDER)),
        'rider on a food delivery must read as busy while dispatching quick',
    );

    const seenFromFood = await runWithVertical('food', async () => getBusyDeliveryPartnerIds());
    assert.ok(seenFromFood.has(String(RIDER)));
});

test('a new document is stamped with the ambient vertical', async () => {
    const created = await runWithVertical('quick', async () => FoodOrder.create(order('quick', { vertical: undefined })));
    assert.equal(created.vertical, 'quick');
    await FoodOrder.deleteOne({ _id: created._id }).setOptions({ skipVerticalScope: true });
});

test('the sentinel is never written into a document', async () => {
    // "all" is a query scope, not a value; the enum would reject it.
    const created = await runWithVertical(CROSS_VERTICAL, async () => FoodOrder.create(order('food', { vertical: undefined })));
    assert.notEqual(created.vertical, CROSS_VERTICAL);
    assert.ok(['food', 'quick'].includes(created.vertical));
    await FoodOrder.deleteOne({ _id: created._id }).setOptions({ skipVerticalScope: true });
});

test('the scope is read at EXECUTION time, not construction time', async () => {
    // The trap that made the first draft of this file wrong. A mongoose query is
    // lazy: find() only builds it, and the pre-hook runs when it is awaited. Build
    // it inside a scope but await it outside and it is filtered by whatever scope
    // is in force when it RUNS -- here, none, so the process default.
    //
    // Express is safe because withVertical wraps next(), so the entire handler
    // chain including its awaits runs inside the scope. Background jobs and any
    // helper that returns an unawaited query are not.
    const query = runWithVertical('quick', () => FoodOrder.find({ userId: CUSTOMER }));
    const rows = await query;
    assert.ok(
        rows.every((r) => r.vertical === 'food'),
        'built under quick, executed outside it -> falls back to the process default',
    );
});

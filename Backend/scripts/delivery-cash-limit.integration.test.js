/**
 * Delivery cash-limit enforcement, against a real mongod.
 *
 * The limit silently did nothing in production: both enforcement points
 * compared `FoodDeliveryWallet.cashInHand` against the ceiling, and nothing
 * increments that field on delivery. Riders were carrying 3x the limit and
 * still being offered cash orders. These tests are written against the
 * behaviour that was missing, so they fail on the old code.
 *
 * Needs mongodb-memory-server (dev only):
 *   npm i --no-save mongodb-memory-server
 *   node --test scripts/delivery-cash-limit.integration.test.js
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;
let cash;
let FoodOrder, FoodDeliveryCashDeposit, FoodDeliveryCashLimit, FoodDeliveryWallet;

const RIDER = new mongoose.Types.ObjectId();
const OTHER = new mongoose.Types.ObjectId();

before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('cashlimit'));

    cash = await import('../src/modules/food/delivery/services/cashInHand.service.js');
    ({ FoodOrder } = await import('../src/modules/food/orders/models/order.model.js'));
    ({ FoodDeliveryCashDeposit } = await import('../src/modules/food/delivery/models/foodDeliveryCashDeposit.model.js'));
    ({ FoodDeliveryCashLimit } = await import('../src/modules/food/admin/models/deliveryCashLimit.model.js'));
    ({ FoodDeliveryWallet } = await import('../src/modules/food/delivery/models/deliveryWallet.model.js'));
});

after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

beforeEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

/** The fields FoodOrder requires but this test does not care about. */
const orderShell = () => ({
    vertical: 'food',
    userId: new mongoose.Types.ObjectId(),
    restaurantId: new mongoose.Types.ObjectId(),
    // location must be a real Point: the collection carries a 2dsphere index
    // and a coordinate-less Point is rejected at insert.
    deliveryAddress: {
        street: 'test', city: 'Indore', state: 'MP', pincode: '452001',
        location: { type: 'Point', coordinates: [75.8577, 22.7196] },
    },
    items: [{ itemId: new mongoose.Types.ObjectId(), name: 'x', price: 1, quantity: 1 }],
});

/** A delivered COD order worth [total], carried by [rider]. */
const codOrder = (rider, total) =>
    FoodOrder.create({
        ...orderShell(),
        orderStatus: 'delivered',
        dispatch: { deliveryPartnerId: rider },
        payment: { method: 'cash', status: 'paid' },
        pricing: { subtotal: total, total },
        riderEarning: Math.round(total * 0.1),
    });

const deposit = (rider, amount, type = 'cod_deposit') =>
    FoodDeliveryCashDeposit.create({ deliveryPartnerId: rider, amount, type, status: 'Completed' });

test('cash in hand counts the whole order, not the rider cut', async () => {
    await codOrder(RIDER, 1000);
    const held = await cash.getCashInHandForPartner(RIDER);
    // riderEarning would be 100. The rider physically holds 1000.
    assert.equal(held, 1000);
});

test('the production scenario: a rider well past the limit is blocked', async () => {
    await FoodDeliveryCashLimit.create({ deliveryCashLimit: 1500, isActive: true });
    // Mirrors rider cee0a428: 23 orders, ~5241 collected, wallet ledger at 0.
    for (let i = 0; i < 23; i += 1) await codOrder(RIDER, 228);
    await FoodDeliveryWallet.create({ deliveryPartnerId: RIDER, cashInHand: 0 });

    const limit = await cash.getCashLimit();
    const held = await cash.getCashInHandForPartner(RIDER);

    assert.equal(limit, 1500);
    assert.ok(held > 5000, `expected >5000 held, got ${held}`);
    assert.equal(cash.isOverCashLimit(held, limit), true, 'this is the case that silently passed before');
});

test('depositing restores headroom and unblocks the rider', async () => {
    await FoodDeliveryCashLimit.create({ deliveryCashLimit: 1500, isActive: true });
    await codOrder(RIDER, 1600);
    const limit = await cash.getCashLimit();

    assert.equal(cash.isOverCashLimit(await cash.getCashInHandForPartner(RIDER), limit), true);

    await deposit(RIDER, 1600);
    const after = await cash.getCashInHandForPartner(RIDER);
    assert.equal(after, 0, 'a full deposit must clear the float');
    assert.equal(cash.isOverCashLimit(after, limit), false, 'the rider must be able to work again');
});

test('a wallet top-up is the rider own money and does not clear COD owed', async (t) => {
    // Deposit `type` distinguishes a rider handing in COD cash from topping up
    // their own wallet. Production and this repo have it; some deployments are
    // still on a deposit model without it, where every row is a COD deposit and
    // there is nothing to tell apart.
    if (!FoodDeliveryCashDeposit.schema.path('type')) {
        t.skip('deposit model has no `type` field in this checkout');
        return;
    }
    await FoodDeliveryCashLimit.create({ deliveryCashLimit: 1500, isActive: true });
    await codOrder(RIDER, 2000);
    await deposit(RIDER, 2000, 'wallet_topup');

    const held = await cash.getCashInHandForPartner(RIDER);
    assert.equal(held, 2000, 'a top-up must not be mistaken for handing in COD cash');
    assert.equal(cash.isOverCashLimit(held, await cash.getCashLimit()), true);
});

test('a pending deposit does not count until it completes', async () => {
    await codOrder(RIDER, 1000);
    await FoodDeliveryCashDeposit.create({
        deliveryPartnerId: RIDER, amount: 1000, type: 'cod_deposit', status: 'Pending',
    });
    assert.equal(await cash.getCashInHandForPartner(RIDER), 1000);
});

test('exactly at the limit blocks; a rupee under does not', async () => {
    const limit = 1500;
    assert.equal(cash.isOverCashLimit(1499, limit), false);
    assert.equal(cash.isOverCashLimit(1500, limit), true, 'at the limit must block, not just above it');
    assert.equal(cash.isOverCashLimit(1501, limit), true);
});

test('a limit of zero never blocks anyone', async () => {
    await codOrder(RIDER, 999999);
    const held = await cash.getCashInHandForPartner(RIDER);
    assert.equal(cash.isOverCashLimit(held, 0), false, 'unconfigured installs must not lock every rider out');
});

test('over-depositing floors at zero rather than granting extra headroom', async () => {
    await codOrder(RIDER, 500);
    await deposit(RIDER, 900);
    assert.equal(await cash.getCashInHandForPartner(RIDER), 0);
});

test('an admin-set ledger value still blocks, matching what the rider is shown', async () => {
    await FoodDeliveryWallet.create({ deliveryPartnerId: RIDER, cashInHand: 2000 });
    const held = await cash.getCashInHandForPartner(RIDER);
    assert.equal(held, 2000, 'a manual correction must be honoured, not ignored');
    assert.equal(cash.isOverCashLimit(held, 1500), true);
});

test('riders are scoped to themselves', async () => {
    await codOrder(RIDER, 3000);
    await codOrder(OTHER, 100);
    const map = await cash.getCashInHandFor([RIDER, OTHER]);
    assert.equal(map.get(String(RIDER)), 3000);
    assert.equal(map.get(String(OTHER)), 100, 'one rider cash must not leak into another');
});

test('a rider with no orders reads as zero, not missing', async () => {
    const map = await cash.getCashInHandFor([RIDER]);
    assert.equal(map.get(String(RIDER)), 0);
});

test('only cash orders count; a prepaid order constrains nothing', async () => {
    await FoodOrder.create({
        ...orderShell(),
        orderStatus: 'delivered',
        dispatch: { deliveryPartnerId: RIDER },
        payment: { method: 'razorpay', status: 'paid' },
        pricing: { subtotal: 5000, total: 5000 },
    });
    assert.equal(await cash.getCashInHandForPartner(RIDER), 0);
});

test('an undelivered cash order is not in hand yet', async () => {
    await FoodOrder.create({
        ...orderShell(),
        orderStatus: 'picked_up',
        dispatch: { deliveryPartnerId: RIDER },
        payment: { method: 'cash', status: 'cod_pending' },
        pricing: { subtotal: 4000, total: 4000 },
    });
    assert.equal(await cash.getCashInHandForPartner(RIDER), 0);
});

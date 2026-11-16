/**
 * Razorpay payment recovery, against a real mongod and a fake Razorpay API.
 *
 *   node --test scripts/razorpay-recovery.integration.test.js
 *
 * Needs mongodb-memory-server (dev only). No network: the Razorpay SDK's HTTP
 * layer is replaced by an in-memory account below.
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';

process.env.RAZORPAY_KEY_ID = 'rzp_test_fake';
process.env.RAZORPAY_KEY_SECRET = 'fake_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';
process.env.REDIS_ENABLED = 'false';

// ---- fake Razorpay account -------------------------------------------------
const rz = { orders: new Map(), payments: new Map(), refunds: [], refundCalls: 0 };
const require = createRequire(import.meta.url);
const API = require('razorpay/dist/api.js');
const ok = (v) => Promise.resolve(v);
const notFound = () => Promise.reject({ statusCode: 404, error: { description: 'not found' } });
API.prototype.get = function get({ url }) {
    let m;
    if ((m = url.match(/^\/orders\/([^/]+)\/payments$/))) {
        return ok({ items: [...rz.payments.values()].filter((p) => p.order_id === m[1]) });
    }
    if ((m = url.match(/^\/orders\/([^/]+)$/))) return rz.orders.has(m[1]) ? ok(rz.orders.get(m[1])) : notFound();
    if ((m = url.match(/^\/payments\/([^/]+)\/refunds$/))) return ok({ items: rz.refunds.filter((r) => r.payment_id === m[1]) });
    if ((m = url.match(/^\/payments\/([^/]+)$/))) return rz.payments.has(m[1]) ? ok(rz.payments.get(m[1])) : notFound();
    if (url === '/payments') return ok({ items: [...rz.payments.values()] });
    return notFound();
};
API.prototype.post = async function post({ url, data }) {
    const m = url.match(/^\/payments\/([^/]+)\/refund$/);
    if (!m) return notFound();
    rz.refundCalls += 1;
    await new Promise((r) => setTimeout(r, 30)); // let concurrent callers overlap
    const p = rz.payments.get(m[1]);
    if (!p || p.status !== 'captured') throw { statusCode: 400, error: { description: 'not refundable' } };
    if (p.amount_refunded + data.amount > p.amount) throw { statusCode: 400, error: { description: 'over-refund' } };
    p.amount_refunded += data.amount;
    const refund = { id: `rfnd_${rz.refunds.length + 1}`, payment_id: p.id, amount: data.amount, speed_requested: data.speed, status: 'pending' };
    rz.refunds.push(refund);
    return refund;
};

const ago = (sec) => Math.floor(Date.now() / 1000) - sec;
function rzOrder(id, notes = {}, ageSec = 600) {
    rz.orders.set(id, { id, receipt: notes.order_id || 'x', notes, created_at: ago(ageSec) });
}
function rzPayment(id, orderId, amountPaise, status = 'captured') {
    const p = { id, order_id: orderId, amount: amountPaise, status, amount_refunded: 0, created_at: ago(300) };
    rz.payments.set(id, p);
    return p;
}

// ---- app under test ---------------------------------------------------------
let server, FoodOrder, RazorpayRefundLedger, settle, refundOnce, handleWebhook;
const CUSTOMER = new mongoose.Types.ObjectId();

const makeOrder = (extra = {}) =>
    FoodOrder.create({
        vertical: 'quick', // Mart: the old webhook could not see these at all
        userId: CUSTOMER,
        restaurantId: new mongoose.Types.ObjectId(),
        items: [{ itemId: 'i1', name: 'thing', price: 250, quantity: 1 }],
        deliveryAddress: { street: 's', city: 'c', state: 'st' },
        pricing: { subtotal: 250, total: 250 },
        orderStatus: 'pending_payment',
        ...extra,
        payment: { method: 'razorpay', status: 'created', ...(extra.payment || {}) },
    });

before(async () => {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri());
    ({ FoodOrder } = await import('../src/modules/food/orders/models/order.model.js'));
    ({ RazorpayRefundLedger } = await import('../src/core/payments/models/razorpayRefundLedger.model.js'));
    ({ settleCapturedRazorpayPayment: settle } = await import('../src/modules/food/orders/services/order-payment-reconcile.service.js'));
    ({ refundRazorpayPaymentOnce: refundOnce } = await import('../src/core/payments/razorpayRefund.service.js'));
    ({ handleRazorpayWebhook: handleWebhook } = await import('../src/core/payments/controllers/razorpayWebhook.controller.js'));
    await RazorpayRefundLedger.init();
});

after(async () => {
    await mongoose.disconnect();
    await server?.stop();
});

beforeEach(() => {
    rz.orders.clear();
    rz.payments.clear();
    rz.refunds.length = 0;
    rz.refundCalls = 0;
});

test('duplicate payment on an already-paid order is refunded once, at normal speed', async () => {
    const order = await makeOrder({
        orderStatus: 'created',
        payment: { status: 'paid', razorpay: { orderId: 'order_A', paymentId: 'pay_first' } },
    });
    rzOrder('order_A', { kind: 'food_order', order_id: String(order._id) });
    rzPayment('pay_first', 'order_A', 25000);
    const second = rzPayment('pay_second', 'order_A', 25000);

    assert.equal(await settle(second, { source: 'test' }), 'refunded_duplicate');
    assert.equal(await settle(second, { source: 'test' }), 'refunded_duplicate'); // repeat webhook
    assert.equal(rz.refundCalls, 1);
    assert.equal(rz.refunds[0].payment_id, 'pay_second');
    assert.equal(rz.refunds[0].speed_requested, 'normal');
    const fresh = await FoodOrder.findById(order._id).setOptions({ skipVerticalScope: true }).lean();
    assert.equal(fresh.payment.status, 'paid', 'the order itself stays paid');
});

test('the payment on record is a no-op', async () => {
    await makeOrder({ orderStatus: 'created', payment: { status: 'paid', razorpay: { orderId: 'order_B', paymentId: 'pay_B' } } });
    assert.equal(await settle(rzPayment('pay_B', 'order_B', 25000)), 'already_settled');
    assert.equal(rz.refundCalls, 0);
});

test('wrong amount: order cancelled, the amount actually paid refunded', async () => {
    const order = await makeOrder({ payment: { razorpay: { orderId: 'order_C' } } });
    const p = rzPayment('pay_C', 'order_C', 10000); // paid 100, total 250
    assert.equal(await settle(p), 'refunded_amount_mismatch');
    const fresh = await FoodOrder.findById(order._id).setOptions({ skipVerticalScope: true }).lean();
    assert.equal(fresh.orderStatus, 'cancelled_by_admin');
    assert.equal(fresh.payment.status, 'refunded');
    assert.equal(fresh.payment.refund.status, 'pending');
    assert.equal(fresh.payment.refund.refundId, 'rfnd_1');
    assert.equal(rz.refunds[0].amount, 10000);
});

test('captured payment whose order was deleted is refunded, if Razorpay says it was an order', async () => {
    rzOrder('order_D', { kind: 'food_order', order_id: new mongoose.Types.ObjectId().toString(), vertical: 'food' });
    assert.equal(await settle(rzPayment('pay_D', 'order_D', 32300)), 'refunded_orphan');
    assert.equal(rz.refunds[0].amount, 32300);
});

test('a wallet top-up or anything not marked as an order payment is never refunded', async () => {
    rzOrder('order_E', {});
    assert.equal(await settle(rzPayment('pay_E', 'order_E', 50000)), 'ignored_not_order_payment');
    assert.equal(rz.refundCalls, 0);
});

test('an orphan this new is left for the next pass (order may still be saving)', async () => {
    rzOrder('order_F', { kind: 'food_order', order_id: 'x' }, 10);
    assert.equal(await settle(rzPayment('pay_F', 'order_F', 1000)), 'orphan_too_new');
    assert.equal(rz.refundCalls, 0);
});

test('authorized (not captured) payments are not settled', async () => {
    assert.equal(await settle(rzPayment('pay_G', 'order_G', 1000, 'authorized')), 'ignored_status_authorized');
});

test('five concurrent refund requests for one payment make one Razorpay refund', async () => {
    rzPayment('pay_H', 'order_H', 5000);
    const results = await Promise.all(
        Array.from({ length: 5 }, () => refundOnce({ paymentId: 'pay_H', amount: 50, reason: 'order_cancelled' })),
    );
    assert.equal(rz.refundCalls, 1);
    assert.ok(results.every((r) => r.success || r.inProgress));
    const again = await refundOnce({ paymentId: 'pay_H', amount: 50, reason: 'order_cancelled' });
    assert.equal(again.alreadyRefunded, true);
    assert.equal(rz.refundCalls, 1);
});

test('a refund Razorpay already has (reply lost) is not sent twice', async () => {
    const p = rzPayment('pay_I', 'order_I', 5000);
    p.amount_refunded = 5000;
    rz.refunds.push({ id: 'rfnd_old', payment_id: 'pay_I', amount: 5000, status: 'processed' });
    const r = await refundOnce({ paymentId: 'pay_I', amount: 50, reason: 'order_cancelled' });
    assert.equal(r.success, true);
    assert.equal(r.refundId, 'rfnd_old');
    assert.equal(rz.refundCalls, 0);
});

function fakeRes() {
    return {
        code: 200,
        body: null,
        status(c) { this.code = c; return this; },
        json(b) { this.body = b; return this; },
        send(b) { this.body = b; return this; },
    };
}
function webhookReq(bodyObj, { secret = 'whsec_test', eventId = 'evt_1' } = {}) {
    const raw = Buffer.from(JSON.stringify(bodyObj));
    return {
        rawBody: raw,
        body: bodyObj,
        headers: {
            'x-razorpay-signature': crypto.createHmac('sha256', secret).update(raw).digest('hex'),
            'x-razorpay-event-id': eventId,
        },
    };
}

test('webhook: bad signature rejected, repeat event id skipped, Mart order refunded once', async () => {
    await makeOrder({ orderStatus: 'created', payment: { status: 'paid', razorpay: { orderId: 'order_J', paymentId: 'pay_J1' } } });
    const p = rzPayment('pay_J2', 'order_J', 25000);
    const body = { event: 'payment.captured', payload: { payment: { entity: p } } };

    const bad = fakeRes();
    await handleWebhook(webhookReq(body, { secret: 'wrong' }), bad);
    assert.equal(bad.code, 400);

    const first = fakeRes();
    await handleWebhook(webhookReq(body, { eventId: 'evt_J' }), first);
    assert.equal(first.code, 200);
    const repeat = fakeRes();
    await handleWebhook(webhookReq(body, { eventId: 'evt_J' }), repeat);
    assert.equal(repeat.body.duplicate, true);

    // order.paid for the same payment, a different event: still one refund
    const op = fakeRes();
    await handleWebhook(webhookReq({ event: 'order.paid', payload: { payment: { entity: p }, order: { entity: { id: 'order_J' } } } }, { eventId: 'evt_J_op' }), op);
    assert.equal(op.code, 200);
    assert.equal(rz.refundCalls, 1);
});

test('webhook refund.processed marks the order refund processed', async () => {
    const order = await makeOrder({
        orderStatus: 'cancelled_by_user',
        payment: { status: 'refunded', razorpay: { orderId: 'order_K', paymentId: 'pay_K' }, refund: { status: 'pending', amount: 250, refundId: 'rfnd_K' } },
    });
    const res = fakeRes();
    await handleWebhook(
        webhookReq({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_K', payment_id: 'pay_K', amount: 25000, status: 'processed' } } } }, { eventId: 'evt_K' }),
        res,
    );
    assert.equal(res.code, 200);
    const fresh = await FoodOrder.findById(order._id).setOptions({ skipVerticalScope: true }).lean();
    assert.equal(fresh.payment.refund.status, 'processed');
});

test('pending order with its payment captured is confirmed and sent on, not refunded', async () => {
    const order = await makeOrder({ payment: { razorpay: { orderId: 'order_L' } } });
    rzOrder('order_L', { kind: 'food_order', order_id: String(order._id) });
    const outcome = await settle(rzPayment('pay_L', 'order_L', 25000), { source: 'test' });
    assert.equal(outcome, 'confirmed');
    const fresh = await FoodOrder.findById(order._id).setOptions({ skipVerticalScope: true }).lean();
    assert.equal(fresh.orderStatus, 'created');
    assert.equal(fresh.payment.status, 'paid');
    assert.equal(fresh.payment.razorpay.paymentId, 'pay_L');
    assert.equal(rz.refundCalls, 0);
    assert.equal(await settle(rz.payments.get('pay_L')), 'already_settled');
});

/**
 * Tests for the rider tip.
 *
 * Run: node --test src/modules/food/orders/services/order-pricing.tip.test.js
 *
 * The tip is the one number on an order that comes from the client and is paid
 * straight out to a person, so the cases that matter are the hostile ones: a
 * negative tip must not shrink the bill, and a huge one must not mint a payout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeliveryTip, MAX_DELIVERY_TIP } from './order-pricing.service.js';

test('a normal tip passes through untouched', () => {
    assert.equal(normalizeDeliveryTip(20), 20);
    assert.equal(normalizeDeliveryTip(37.5), 37.5);
});

test('a negative tip cannot be used to shrink the bill', () => {
    assert.equal(normalizeDeliveryTip(-50), 0);
    assert.equal(normalizeDeliveryTip(-0.01), 0);
});

test('an oversized tip is capped, not accepted', () => {
    assert.equal(normalizeDeliveryTip(MAX_DELIVERY_TIP + 1), MAX_DELIVERY_TIP);
    assert.equal(normalizeDeliveryTip(10_000_000), MAX_DELIVERY_TIP);
});

test('junk becomes no tip rather than NaN leaking into the total', () => {
    // A NaN here would propagate into `total` and make the whole order
    // unchargeable, so these must land on 0 and not throw.
    for (const junk of [undefined, null, '', 'abc', {}, [], NaN, Infinity, -Infinity]) {
        assert.equal(normalizeDeliveryTip(junk), 0, `${JSON.stringify(junk)} should be 0`);
    }
});

test('a tip is rounded to paise, so the total stays exact', () => {
    assert.equal(normalizeDeliveryTip(10.005), 10.01);
    assert.equal(normalizeDeliveryTip(0.014), 0.01);
});

test('the ledger treats a tip as pass-through, never as profit', () => {
    // Mirrors createInitialTransaction: riderShare carries the tip (riderEarning
    // is base + tip) and the revenue side carries the matching term. Platform
    // profit must therefore be identical with and without a tip -- the bug this
    // guards is booking a loss exactly the size of every tip.
    // Rounded the same way createInitialTransaction rounds it; comparing raw
    // floats here fails on 30.400000000000006, which is the test being wrong
    // about binary floating point rather than the money being wrong.
    const profit = ({ platformFee, deliveryFee, deliveryFeeGst, restaurantCommission, deliveryTip, riderBase }) =>
        Math.round(
            (platformFee + deliveryFee + deliveryFeeGst + restaurantCommission + deliveryTip
                - (riderBase + deliveryTip)) * 100,
        ) / 100;

    const base = {
        platformFee: 10, deliveryFee: 30, deliveryFeeGst: 5.4,
        restaurantCommission: 25, riderBase: 40,
    };

    assert.equal(profit({ ...base, deliveryTip: 0 }), 30.4);
    assert.equal(profit({ ...base, deliveryTip: 50 }), 30.4, 'a tip must not change platform profit');
    assert.equal(profit({ ...base, deliveryTip: MAX_DELIVERY_TIP }), 30.4);
});

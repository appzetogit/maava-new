/** The null hole that made both fallbacks unreachable. Run: node packing.check.mjs */
import assert from 'node:assert/strict';
import { packingMinutesForOrder } from './src/modules/food/orders/services/order.helpers.js';
import { resolvePackingMinutes } from './src/modules/food/orders/services/order-pricing.service.js';

const DEFAULT = resolvePackingMinutes({ packingMinutes: undefined });
assert.ok(DEFAULT > 0, `fallback must be non-zero, got ${DEFAULT}`);

// The regression: packingMinutes defaults to null, and Number(null) === 0.
for (const missing of [null, undefined, '']) {
  assert.equal(resolvePackingMinutes({ packingMinutes: missing }), DEFAULT,
    `feeSettings ${JSON.stringify(missing)} must fall back`);
  assert.equal(packingMinutesForOrder({ pricing: { packingMinutes: missing } }), DEFAULT,
    `order ${JSON.stringify(missing)} must fall back`);
}
assert.equal(packingMinutesForOrder({}), DEFAULT, 'no pricing at all must fall back');
assert.equal(packingMinutesForOrder(null), DEFAULT, 'no order at all must fall back');

// A deliberately configured 0 is still honoured -- it is a real value.
assert.equal(resolvePackingMinutes({ packingMinutes: 0 }), 0, 'explicit 0 is a real setting');
assert.equal(packingMinutesForOrder({ pricing: { packingMinutes: 0 } }), 0, 'explicit 0 is a real quote');
// And a genuine number survives.
assert.equal(packingMinutesForOrder({ pricing: { packingMinutes: 12 } }), 12);
assert.equal(resolvePackingMinutes({ packingMinutes: '8' }), 8, 'numeric strings still parse');
// Junk falls back rather than poisoning the countdown with NaN.
assert.equal(packingMinutesForOrder({ pricing: { packingMinutes: 'abc' } }), DEFAULT);
assert.equal(packingMinutesForOrder({ pricing: { packingMinutes: -5 } }), DEFAULT);

console.log(`packing minutes OK (fallback = ${DEFAULT})`);

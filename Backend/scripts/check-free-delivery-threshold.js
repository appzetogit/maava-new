// Self-check for the "spend Rs.X, get free delivery" rule.
// Run: node scripts/check-free-delivery-threshold.js
import assert from 'node:assert/strict';
import { resolveUserDeliveryFee } from '../src/modules/food/orders/services/order-pricing.service.js';

const rangedSettings = {
  deliveryFeeRanges: [
    { min: 0, max: 5, fee: 20 },
    { min: 5, max: 15, fee: 35 },
  ],
  freeDeliveryThreshold: 199,
};

// Under the threshold: normal distance-band pricing, untouched by the rule.
assert.equal(
  resolveUserDeliveryFee(rangedSettings, { subtotal: 150, distanceKm: 2 }).deliveryFee,
  20,
);
assert.equal(
  resolveUserDeliveryFee(rangedSettings, { subtotal: 150, distanceKm: 8 }).deliveryFee,
  35,
);

// At or over the threshold: free, regardless of distance or which band it
// would have matched — the whole point is that spend beats distance.
assert.equal(
  resolveUserDeliveryFee(rangedSettings, { subtotal: 199, distanceKm: 8 }).deliveryFee,
  0,
);
assert.equal(
  resolveUserDeliveryFee(rangedSettings, { subtotal: 500, distanceKm: 8 }).deliveryFee,
  0,
);
assert.equal(
  resolveUserDeliveryFee(rangedSettings, { subtotal: 199, distanceKm: 8 }).source,
  'free_delivery_threshold',
);

// Rule off (0, the schema default, or unset) never grants free delivery —
// an install that never configured this must keep charging as before.
const noThreshold = { deliveryFeeRanges: rangedSettings.deliveryFeeRanges };
assert.equal(
  resolveUserDeliveryFee(noThreshold, { subtotal: 999999, distanceKm: 2 }).deliveryFee,
  20,
);
assert.equal(
  resolveUserDeliveryFee(
    { ...rangedSettings, freeDeliveryThreshold: 0 },
    { subtotal: 999999, distanceKm: 2 },
  ).deliveryFee,
  20,
);

// Flat-fee settings (no ranges) still honour the threshold.
const flatSettings = { deliveryFee: 25, freeDeliveryThreshold: 199 };
assert.equal(
  resolveUserDeliveryFee(flatSettings, { subtotal: 100 }).deliveryFee,
  25,
);
assert.equal(
  resolveUserDeliveryFee(flatSettings, { subtotal: 199 }).deliveryFee,
  0,
);

console.log('free-delivery-threshold checks passed');

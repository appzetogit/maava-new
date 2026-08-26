// Self-check for the rider serviceType feature: dispatch matching + validators.
// Run: node scripts/check-service-type.js
import assert from 'node:assert/strict';
import {
    partnerServesVertical,
    orderSourceTitle,
} from '../src/modules/food/orders/services/order-dispatch.service.js';
import {
    validateDeliveryRegisterDto,
    validateDeliveryProfileUpdateDto,
} from '../src/modules/food/delivery/validators/delivery.validator.js';

// serviceType × order vertical matrix
assert.equal(partnerServesVertical('food', 'food'), true);
assert.equal(partnerServesVertical('food', 'quick'), false);
assert.equal(partnerServesVertical('quick', 'quick'), true);
assert.equal(partnerServesVertical('quick', 'food'), false);
assert.equal(partnerServesVertical('both', 'food'), true);
assert.equal(partnerServesVertical('both', 'quick'), true);
// Legacy riders (no serviceType) and legacy orders (no vertical) always match.
assert.equal(partnerServesVertical(undefined, 'food'), true);
assert.equal(partnerServesVertical('food', undefined), true);
// Both toggles off: the rider receives nothing, even legacy orders.
assert.equal(partnerServesVertical('none', 'food'), false);
assert.equal(partnerServesVertical('none', 'quick'), false);
assert.equal(partnerServesVertical('none', undefined), false);

// Alert titles name the brand the pickup is for.
assert.equal(orderSourceTitle({ vertical: 'food' }), 'New order from Maava Food');
assert.equal(orderSourceTitle({ vertical: 'quick' }), 'New order from HiberMart');
assert.equal(orderSourceTitle({}), 'New order from Maava Food');

// Register accepts each valid serviceType and rejects garbage.
const base = { name: 'R', phone: '9876543210' };
for (const t of ['food', 'quick', 'both', 'none']) {
    assert.equal(validateDeliveryRegisterDto({ ...base, serviceType: t }).serviceType, t);
}
assert.equal(validateDeliveryRegisterDto(base).serviceType, undefined);
assert.throws(() => validateDeliveryRegisterDto({ ...base, serviceType: 'mart' }));

// Profile update accepts a serviceType change and rejects garbage.
assert.equal(validateDeliveryProfileUpdateDto({ serviceType: 'quick' }).serviceType, 'quick');
assert.throws(() => validateDeliveryProfileUpdateDto({ serviceType: 'all' }));

console.log('service-type checks passed');

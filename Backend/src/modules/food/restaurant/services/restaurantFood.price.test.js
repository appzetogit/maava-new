import test from 'node:test';
import assert from 'node:assert/strict';

import { getCreateFoodPricing } from './restaurantFood.service.js';

// A ₹0 item is sellable in the catalog but makes the cart total 0, which
// silently disables the customer's "Proceed to Pay" button — a dead CTA with
// no explanation. Variants already required > 0; base price did not.
test('base price of 0 is rejected', () => {
    assert.throws(() => getCreateFoodPricing({ price: 0 }), /greater than 0/);
});

test('a normal base price is accepted', () => {
    assert.equal(getCreateFoodPricing({ price: 90 }).price, 90);
});

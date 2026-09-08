/**
 * Pins the schema-level guarantees the delivery-incentive award path relies on.
 *
 * The behavioural tests need a real mongod (delivery-incentive.integration.test.js).
 * These do not, so the things that would silently un-break the feature -- the
 * unique index that stops a rider being paid twice, the vertical scoping that
 * stops a food delivery awarding a grocery offer, and the defaults that keep
 * existing offers on manual approval -- still get checked everywhere.
 *
 *   node scripts/incentive.selfcheck.mjs
 */
import assert from 'node:assert/strict';
import { FoodEarningAddon } from '../src/modules/food/admin/models/earningAddon.model.js';
import { FoodEarningAddonHistory } from '../src/modules/food/admin/models/earningAddonHistory.model.js';
import { earnedCycles } from '../src/modules/food/delivery/services/deliveryIncentive.service.js';

// The award path creates the history row FIRST and treats a duplicate-key error
// as "already paid". Drop this index and that check silently stops working --
// every concurrent delivery would pay again, with no error anywhere.
const lock = FoodEarningAddonHistory.schema.indexes().find(([keys, opts]) =>
    opts?.unique &&
    JSON.stringify(keys) === JSON.stringify({ vertical: 1, offerId: 1, deliveryPartnerId: 1, cycle: 1 })
);
assert.ok(lock, 'the unique award lock must be declared on the history schema');

assert.ok(FoodEarningAddon.schema.path('vertical'), 'offers must be vertical-scoped');
assert.ok(FoodEarningAddonHistory.schema.path('vertical'), 'history must be vertical-scoped');
assert.ok(FoodEarningAddonHistory.schema.path('cycle'), 'history must carry a cycle');

// Both default OFF on purpose. Every payout in this collection has passed an
// admin's eye until now, and a deploy must not quietly start auto-paying the
// offers that already exist.
const offer = new FoodEarningAddon({
    title: 't',
    requiredOrders: 5,
    earningAmount: 100,
    startDate: new Date(),
    endDate: new Date(),
    vertical: 'food',
});
assert.equal(offer.repeatable, false, 'repeatable must default off');
assert.equal(offer.autoCredit, false, 'autoCredit must default off');
assert.equal(offer.currentRedemptions, 0);

const history = new FoodEarningAddonHistory({
    offerId: offer._id,
    deliveryPartnerId: offer._id,
    vertical: 'food',
});
assert.equal(history.cycle, 0, 'the first award is cycle 0');
assert.equal(history.status, 'pending');

// A one-shot offer pays once however many deliveries the rider runs; a
// repeatable one pays per completed multiple ("5 -> Rs.100, and so on").
assert.equal(earnedCycles(4, 5, false), 0);
assert.equal(earnedCycles(50, 5, false), 1);
assert.equal(earnedCycles(9, 5, true), 1);
assert.equal(earnedCycles(15, 5, true), 3);

console.log('incentive selfcheck: OK');

/**
 * Cycle arithmetic for delivery incentives -- pure, no database.
 *
 * Split out from the integration test so the rule that decides HOW MUCH a rider
 * is owed still runs everywhere, including machines where mongodb-memory-server
 * cannot start a mongod.
 *
 *   node --test scripts/delivery-incentive.cycles.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedCycles } from '../src/modules/food/delivery/services/deliveryIncentive.service.js';

test('cycle math: one-shot caps at a single award, repeatable pays per multiple', () => {
    assert.equal(earnedCycles(4, 5, false), 0, 'below the threshold pays nothing');
    assert.equal(earnedCycles(5, 5, false), 1);
    assert.equal(earnedCycles(50, 5, false), 1, 'a one-shot offer never pays twice');

    assert.equal(earnedCycles(4, 5, true), 0);
    assert.equal(earnedCycles(5, 5, true), 1);
    assert.equal(earnedCycles(9, 5, true), 1, 'a part-finished cycle does not pay');
    assert.equal(earnedCycles(15, 5, true), 3, '"5 -> Rs.100, and so on"');

    // requiredOrders is min:1 in the schema, but a 0 would divide by zero into
    // Infinity cycles and pay forever.
    assert.equal(earnedCycles(10, 0, true), 10);
});

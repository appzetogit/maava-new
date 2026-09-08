// Self-check for the "cash-in-hand ceiling" rule.
// Run: node scripts/check-cash-limit.js
import assert from 'node:assert/strict';
import { isAtOrAboveCashLimit } from '../src/modules/food/delivery/services/walletMath.js';
import { FoodDeliveryCashLimit } from '../src/modules/food/admin/models/deliveryCashLimit.model.js';

// The rule is OFF unless an admin configures it — an install that never set a
// limit must keep offering cash orders to every rider.
assert.equal(isAtOrAboveCashLimit(0, 0), false);
assert.equal(isAtOrAboveCashLimit(0, undefined), false);
assert.equal(isAtOrAboveCashLimit(0, null), false);
assert.equal(FoodDeliveryCashLimit.schema.path('deliveryCashLimit').defaultValue, 0);

// Configured at 1500: under the ceiling passes, exactly-on and over both block.
// Unlike the wallet floor, the ceiling itself already blocks — it is a cap to
// stay under, not a minimum to clear.
assert.equal(isAtOrAboveCashLimit(1499.99, 1500), false);
assert.equal(isAtOrAboveCashLimit(1500, 1500), true);
assert.equal(isAtOrAboveCashLimit(1500.01, 1500), true);
assert.equal(isAtOrAboveCashLimit(5000, 1500), true);

// Junk cash-in-hand reads as zero rather than as "over the limit".
assert.equal(isAtOrAboveCashLimit(undefined, 1500), false);
assert.equal(isAtOrAboveCashLimit(null, 1500), false);
assert.equal(isAtOrAboveCashLimit(NaN, 1500), false);

// A negative limit is not a rule.
assert.equal(isAtOrAboveCashLimit(5000, -50), false);

// -------------------------------------------------- auto-offline lifecycle
// Same predicate the availability endpoint and enforceCashLimitOffline use, so
// "can't go online" and "gets taken offline" can never disagree.
const mayBeOnline = (cashInHand, limit) => !isAtOrAboveCashLimit(cashInHand, limit);

const LIMIT = 1500; // stands in for the admin setting

// Shift start: nothing collected yet.
assert.equal(mayBeOnline(0, LIMIT), true);

// Delivers cash orders totalling exactly the limit — blocked here.
assert.equal(mayBeOnline(LIMIT, LIMIT), false);

// Deposits Rs.1: back under the ceiling, allowed online again.
assert.equal(mayBeOnline(LIMIT - 1, LIMIT), true);

// The boundary itself blocks: >= limit, not > limit — the opposite sense from
// the wallet floor's >= minimum being allowed.
assert.equal(mayBeOnline(1499, LIMIT), true);
assert.equal(mayBeOnline(1500, LIMIT), false);

// Rule off (admin never set it) never takes anyone offline, however much
// cash they are holding.
assert.equal(mayBeOnline(999999, 0), true);
assert.equal(mayBeOnline(999999, undefined), true);

console.log('cash-limit + auto-offline checks passed');

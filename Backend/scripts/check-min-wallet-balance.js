// Self-check for the "minimum wallet balance to receive new orders" rule.
// Run: node scripts/check-min-wallet-balance.js
import assert from 'node:assert/strict';
import {
    computePocketBalance,
    isBelowWalletMinimum,
} from '../src/modules/food/delivery/services/walletMath.js';
import { FoodDeliveryCashLimit } from '../src/modules/food/admin/models/deliveryCashLimit.model.js';

// The rule is OFF unless an admin configures it — an install that never set a
// minimum must keep offering orders to every rider.
assert.equal(isBelowWalletMinimum(0, 0), false);
assert.equal(isBelowWalletMinimum(0, undefined), false);
assert.equal(isBelowWalletMinimum(0, null), false);
assert.equal(FoodDeliveryCashLimit.schema.path('minWalletBalanceForOrders').defaultValue, 0);

// Configured at 300: below blocks, exactly-on-the-floor and above do not.
assert.equal(isBelowWalletMinimum(299.99, 300), true);
assert.equal(isBelowWalletMinimum(0, 300), true);
assert.equal(isBelowWalletMinimum(300, 300), false);
assert.equal(isBelowWalletMinimum(300.01, 300), false);
assert.equal(isBelowWalletMinimum(5000, 300), false);

// Junk balances read as zero rather than as "allowed".
assert.equal(isBelowWalletMinimum(undefined, 300), true);
assert.equal(isBelowWalletMinimum(null, 300), true);
assert.equal(isBelowWalletMinimum(NaN, 300), true);

// A negative floor is not a rule.
assert.equal(isBelowWalletMinimum(0, -50), false);

// ---------------------------------------------------------------- COD flow
// Earning goes in, the COD cash the rider collected comes out, and the two are
// separate amounts: a Rs.500 COD order paying Rs.30 leaves the rider 30 richer
// on paper but 500 down in wallet until they deposit.
assert.equal(computePocketBalance({ totalEarned: 30, cashInHand: 500 }), 0);
assert.equal(computePocketBalance({ totalEarned: 1000, cashInHand: 500 }), 500);
assert.equal(computePocketBalance({ totalEarned: 1000, totalBonus: 200, cashInHand: 500 }), 700);

// Depositing the cash restores the balance — cashInHand is collected minus
// deposited, so a full deposit takes the deduction back to zero.
assert.equal(computePocketBalance({ totalEarned: 1000, cashInHand: 0 }), 1000);

// Withdrawals still come out on top of the COD hold.
assert.equal(
    computePocketBalance({ totalEarned: 1000, totalWithdrawn: 200, pendingWithdrawals: 100, cashInHand: 500 }),
    200,
);

// Never negative, and junk reads as zero rather than as NaN.
assert.equal(computePocketBalance({ totalEarned: 100, cashInHand: 5000 }), 0);
assert.equal(computePocketBalance({}), 0);
assert.equal(computePocketBalance(), 0);
assert.equal(computePocketBalance({ totalEarned: undefined, cashInHand: null }), 0);

// ------------------------------------------------------------ wallet top-up
// A top-up is the rider's own money and lands straight on the balance, so it
// is what gets them back over the floor when they have no COD cash to deposit.
assert.equal(computePocketBalance({ totalEarned: 100, topUps: 500 }), 600);
assert.equal(computePocketBalance({ totalEarned: 100, topUps: 500, cashInHand: 300 }), 300);
assert.equal(isBelowWalletMinimum(computePocketBalance({ totalEarned: 0, topUps: 500 }), 300), false);
assert.equal(isBelowWalletMinimum(computePocketBalance({ totalEarned: 0, topUps: 0 }), 300), true);

// The two rules compose: COD deductions are what push a rider under the floor.
const afterCod = computePocketBalance({ totalEarned: 700, cashInHand: 500 });
assert.equal(afterCod, 200);
assert.equal(isBelowWalletMinimum(afterCod, 300), true);
assert.equal(isBelowWalletMinimum(computePocketBalance({ totalEarned: 700 }), 300), false);

// -------------------------------------------------- auto-offline lifecycle
// A rider may be online exactly when they are not below the floor. Same
// predicate the availability endpoint and enforceWalletMinimumOffline use, so
// "can't go online" and "gets taken offline" can never disagree.
const mayBeOnline = (balance, minimum) => !isBelowWalletMinimum(balance, minimum);

const FLOOR = 300; // stands in for the admin setting; nothing reads a constant

// Shift start: earnings only, comfortably over.
let balance = computePocketBalance({ totalEarned: 700 });
assert.equal(mayBeOnline(balance, FLOOR), true);

// Delivers a Rs.500 COD order — the cash is now company money in their pocket.
balance = computePocketBalance({ totalEarned: 700, cashInHand: 500 });
assert.equal(balance, 200);
assert.equal(mayBeOnline(balance, FLOOR), false); // forced offline here

// Tops up Rs.50: still short, so still offline.
balance = computePocketBalance({ totalEarned: 700, cashInHand: 500, topUps: 50 });
assert.equal(balance, 250);
assert.equal(mayBeOnline(balance, FLOOR), false);

// Tops up Rs.150 more and clears the floor — allowed back online.
balance = computePocketBalance({ totalEarned: 700, cashInHand: 500, topUps: 200 });
assert.equal(balance, 400);
assert.equal(mayBeOnline(balance, FLOOR), true);

// The boundary itself is allowed: >= minimum, not > minimum.
assert.equal(mayBeOnline(300, FLOOR), true);
assert.equal(mayBeOnline(299.99, FLOOR), false);

// Depositing the COD cash works just as well as topping up.
balance = computePocketBalance({ totalEarned: 700, cashInHand: 0 });
assert.equal(mayBeOnline(balance, FLOOR), true);

// Rule off (admin never set it) never takes anyone offline, however broke.
assert.equal(mayBeOnline(0, 0), true);
assert.equal(mayBeOnline(0, undefined), true);

console.log('min-wallet-balance + COD + auto-offline checks passed');

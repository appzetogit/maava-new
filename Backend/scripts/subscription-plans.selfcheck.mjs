/**
 * Subscription plan catalog checks.
 *
 * The catalog went from three hardcoded tiers to an admin-managed list of any
 * length. The thing that matters is that it still resolves GMV to exactly the
 * same plan as before for anyone who has not changed their settings -- this
 * decides what restaurants are charged.
 */
import assert from 'node:assert/strict';
import {
    buildPlanCatalog,
    resolveEligiblePlanByGmv,
    validatePlanCatalog,
    normalizePlanName,
    planKeyFromLabel,
} from '../src/modules/food/restaurant/services/subscriptionPlan.service.js';

const legacy = buildPlanCatalog({});
assert.equal(legacy.isLegacy, true, 'empty settings must fall back to the legacy tiers');
assert.equal(legacy.plans.length, 3);

// --- the defaults still band exactly as they did -----------------------------
assert.equal(resolveEligiblePlanByGmv(0, legacy), 'starter');
assert.equal(resolveEligiblePlanByGmv(29999, legacy), 'starter');
assert.equal(resolveEligiblePlanByGmv(30000, legacy), 'starter');
assert.equal(resolveEligiblePlanByGmv(30000.01, legacy), 'growth');
assert.equal(resolveEligiblePlanByGmv(60000, legacy), 'growth');
assert.equal(resolveEligiblePlanByGmv(60000.01, legacy), 'premium');
assert.equal(resolveEligiblePlanByGmv(9_999_999, legacy), 'premium');
console.log('legacy bands unchanged        : ok');

// --- a migrated catalog bills identically ------------------------------------
const migrated = buildPlanCatalog({
    plans: legacy.plans.map((p, i) => ({
        key: p.id, label: p.label, price: p.basePrice,
        gmvMin: p.gmvMin, gmvMax: p.gmvMax, isActive: true, sortOrder: i,
    })),
});
assert.equal(migrated.isLegacy, false);
for (const gmv of [0, 1, 29999, 30000, 30000.01, 45000, 60000, 60000.01, 1e6]) {
    assert.equal(
        resolveEligiblePlanByGmv(gmv, migrated),
        resolveEligiblePlanByGmv(gmv, legacy),
        `GMV ${gmv} resolved differently after migration`,
    );
}
console.log('migrated == legacy            : ok');

// --- arbitrary N -------------------------------------------------------------
const five = buildPlanCatalog({
    plans: [
        { key: 'free',   label: 'Free',   price: 0,    gmvMin: 0,     gmvMax: 5000 },
        { key: 'micro',  label: 'Micro',  price: 299,  gmvMin: 5001,  gmvMax: 15000 },
        { key: 'small',  label: 'Small',  price: 799,  gmvMin: 15001, gmvMax: 40000 },
        { key: 'mid',    label: 'Mid',    price: 1499, gmvMin: 40001, gmvMax: 90000 },
        { key: 'apex',   label: 'Apex',   price: 4999, gmvMin: 90001, gmvMax: null },
    ],
});
assert.equal(five.plans.length, 5);
assert.equal(resolveEligiblePlanByGmv(0, five), 'free');
assert.equal(resolveEligiblePlanByGmv(15000, five), 'micro');
assert.equal(resolveEligiblePlanByGmv(90001, five), 'apex');
assert.equal(resolveEligiblePlanByGmv(5_000_000, five), 'apex');
console.log('five tiers resolve            : ok');

// --- order of entry must not matter ------------------------------------------
const shuffled = buildPlanCatalog({
    plans: [
        { key: 'apex',  label: 'Apex',  price: 4999, gmvMin: 90001, gmvMax: null },
        { key: 'free',  label: 'Free',  price: 0,    gmvMin: 0,     gmvMax: 5000 },
        { key: 'small', label: 'Small', price: 799,  gmvMin: 15001, gmvMax: 40000 },
        { key: 'micro', label: 'Micro', price: 299,  gmvMin: 5001,  gmvMax: 15000 },
        { key: 'mid',   label: 'Mid',   price: 1499, gmvMin: 40001, gmvMax: 90000 },
    ],
});
for (const gmv of [0, 5000, 15000, 40000, 90001, 1e7]) {
    assert.equal(resolveEligiblePlanByGmv(gmv, shuffled), resolveEligiblePlanByGmv(gmv, five));
}
console.log('entry order irrelevant        : ok');

// --- an inactive plan is skipped, and its band falls to the tier below --------
const withInactive = buildPlanCatalog({
    plans: [
        { key: 'a', label: 'A', price: 100, gmvMin: 0,     gmvMax: 10000 },
        { key: 'b', label: 'B', price: 500, gmvMin: 10001, gmvMax: 50000, isActive: false },
        { key: 'c', label: 'C', price: 900, gmvMin: 50001, gmvMax: null },
    ],
});
assert.equal(withInactive.plans.length, 2);
assert.equal(resolveEligiblePlanByGmv(30000, withInactive), 'a', 'a gap must bill the tier below, never nothing');
console.log('inactive skipped, no gap hole : ok');

// --- an empty catalog must never bill zero -----------------------------------
const noneActive = buildPlanCatalog({
    plans: [{ key: 'x', label: 'X', price: 10, gmvMin: 0, gmvMax: null, isActive: false }],
});
assert.equal(noneActive.isLegacy, true, 'all-inactive must fall back, not bill nothing');
assert.ok(resolveEligiblePlanByGmv(50000, noneActive));
console.log('all-inactive falls back       : ok');

// --- validation surfaces the mistakes an admin can actually make -------------
assert.equal(validatePlanCatalog(five.plans.map((p) => ({ ...p, key: p.id, label: p.label, price: p.basePrice }))).length, 0);

const gapIssues = validatePlanCatalog([
    { key: 'a', label: 'A', price: 1, gmvMin: 0,     gmvMax: 1000 },
    { key: 'b', label: 'B', price: 2, gmvMin: 50000, gmvMax: null },
]);
assert.ok(gapIssues.some((i) => i.includes('Gap')), 'a gap must be reported');

const dupIssues = validatePlanCatalog([
    { key: 'a', label: 'A', price: 1, gmvMin: 0,     gmvMax: 1000 },
    { key: 'a', label: 'A2', price: 2, gmvMin: 1001, gmvMax: null },
]);
assert.ok(dupIssues.some((i) => i.includes('Duplicate')), 'a duplicate key must be reported');

const openIssues = validatePlanCatalog([
    { key: 'a', label: 'A', price: 1, gmvMin: 0, gmvMax: 1000 },
]);
assert.ok(openIssues.some((i) => i.includes('highest earners')), 'a bounded top plan must be reported');
console.log('validation catches gaps/dupes : ok');

// --- plan names ---------------------------------------------------------------
assert.equal(normalizePlanName('silver'), 'starter', 'legacy names still map');
assert.equal(normalizePlanName('gold'), 'growth');
assert.equal(normalizePlanName('apex', five), 'apex', 'a catalog plan passes through');
// An unknown name must NOT silently become the cheapest tier.
assert.equal(normalizePlanName('retired_tier'), 'retired_tier');
assert.equal(planKeyFromLabel('  Super Pro!! '), 'super_pro');
console.log('plan name resolution          : ok');

console.log('\nsubscription plans: all assertions passed');

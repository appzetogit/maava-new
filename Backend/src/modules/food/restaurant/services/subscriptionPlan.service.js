/**
 * Subscription plan catalog helpers (calendar-month postpaid model).
 *
 * Plans are assigned automatically from the restaurant's monthly earnings
 * (restaurant net share) -- see subscriptionBilling.service.js for the billing
 * engine. This module only knows how to build the plan catalog from admin
 * settings and resolve which plan a GMV amount falls into.
 *
 * The catalog is an arbitrary-length list configured in the admin panel. It
 * used to be exactly three tiers hardcoded here and as nine fixed columns on
 * the settings document, so adding a fourth, renaming one, or running two
 * needed a code change and a deploy.
 */

export const GST_RATE = 0.18;

/**
 * The tiers this system shipped with, still referenced by existing invoices
 * and restaurant records. Retained so `normalizePlanName` keeps resolving them
 * and so the legacy-column fallback can name its plans.
 */
export const SUBSCRIPTION_PLAN_KEYS = {
    STARTER: "starter",
    GROWTH: "growth",
    PREMIUM: "premium",
};

const LEGACY_PLAN_MAP = {
    silver: SUBSCRIPTION_PLAN_KEYS.STARTER,
    gold: SUBSCRIPTION_PLAN_KEYS.GROWTH,
    pro: SUBSCRIPTION_PLAN_KEYS.GROWTH,
    elite: SUBSCRIPTION_PLAN_KEYS.PREMIUM,
};

const toNum = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

/** Slug a label into a stable key. Keys are immutable once a plan has billed. */
export const planKeyFromLabel = (label) =>
    String(label || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

/**
 * Resolve a stored plan name to one the catalog knows about.
 *
 * Unknown names now pass through unchanged rather than collapsing to "starter".
 * With a fixed three-tier enum, anything unrecognised was corrupt data and
 * starter was the safe floor; with an admin-managed catalog it is far more
 * likely to be a tier that was renamed or retired, and silently rebilling that
 * restaurant at the cheapest rate would be worse than reporting what it is.
 */
export const normalizePlanName = (value, catalog = null) => {
    const plan = String(value || "").trim().toLowerCase();
    if (!plan) return SUBSCRIPTION_PLAN_KEYS.STARTER;
    if (catalog?.plans?.some((p) => p.id === plan)) return plan;
    if (LEGACY_PLAN_MAP[plan]) return LEGACY_PLAN_MAP[plan];
    return plan;
};

/** The three-tier catalog, rebuilt from the legacy columns. */
const buildLegacyCatalog = (settings) => {
    const starterPrice = Math.max(0, toNum(settings.starterPrice, 999));
    const growthPrice = Math.max(0, toNum(settings.growthPrice, 1999));
    const premiumPrice = Math.max(0, toNum(settings.premiumPrice, 2999));
    const starterMinGmv = Math.max(0, toNum(settings.starterMinGmv, 0));
    const starterMaxGmv = Math.max(starterMinGmv, toNum(settings.starterMaxGmv, 30000));
    const growthMinGmv = Math.max(starterMaxGmv, toNum(settings.growthMinGmv, starterMaxGmv + 0.01));
    const growthMaxGmv = Math.max(growthMinGmv, toNum(settings.growthMaxGmv, 60000));
    const premiumMinGmv = Math.max(growthMaxGmv, toNum(settings.premiumMinGmv, growthMaxGmv + 0.01));

    return [
        { id: SUBSCRIPTION_PLAN_KEYS.STARTER, label: "Starter", basePrice: starterPrice, gmvMin: starterMinGmv, gmvMax: starterMaxGmv },
        { id: SUBSCRIPTION_PLAN_KEYS.GROWTH, label: "Growth", basePrice: growthPrice, gmvMin: growthMinGmv, gmvMax: growthMaxGmv },
        { id: SUBSCRIPTION_PLAN_KEYS.PREMIUM, label: "Premium", basePrice: premiumPrice, gmvMin: premiumMinGmv, gmvMax: null },
    ];
};

/**
 * Build the plan catalog from admin settings.
 *
 * Falls back to the legacy columns when `plans` is absent or has no active
 * rows. That fallback is load-bearing during rollout: a settings document
 * written before the migration has no `plans`, and an empty catalog would mean
 * every restaurant resolves to no plan and gets billed nothing.
 *
 * Sorted by gmvMin so the resolver can walk the bands in order regardless of
 * the order an admin happened to add them in.
 */
export const buildPlanCatalog = (settings = {}) => {
    const configured = Array.isArray(settings.plans) ? settings.plans : [];

    const active = configured
        .filter((p) => p && p.isActive !== false && String(p.key || "").trim())
        .map((p) => ({
            id: String(p.key).trim().toLowerCase(),
            label: String(p.label || p.key).trim(),
            basePrice: Math.max(0, toNum(p.price, 0)),
            gmvMin: Math.max(0, toNum(p.gmvMin, 0)),
            // null and undefined both mean unbounded; 0 does not.
            gmvMax: p.gmvMax === null || p.gmvMax === undefined ? null : toNum(p.gmvMax, null),
        }))
        .sort((a, b) => a.gmvMin - b.gmvMin);

    const plans = active.length > 0 ? active : buildLegacyCatalog(settings);

    // Kept for the admin screen and the settings API, which still surface the
    // three legacy bands. Derived from the catalog rather than read separately,
    // so they cannot disagree with the plans actually being billed.
    const [first, second, third] = plans;

    return {
        plans,
        isLegacy: active.length === 0,
        starterMinGmv: first?.gmvMin ?? 0,
        starterMaxGmv: first?.gmvMax ?? null,
        growthMinGmv: second?.gmvMin ?? null,
        growthMaxGmv: second?.gmvMax ?? null,
        premiumMinGmv: third?.gmvMin ?? null,
    };
};

/**
 * Which plan a month's GMV falls into.
 *
 * Walks the bands in ascending order and returns the first that contains the
 * amount. Anything not inside a band falls to the nearest tier at or below it,
 * so a restaurant earning inside a gap is still billed rather than silently
 * skipped. See the note at the fallback for why it is the tier below and not
 * the highest one.
 */
export const resolveEligiblePlanByGmv = (gmv = 0, catalog = buildPlanCatalog({})) => {
    const safeGmv = Math.max(0, toNum(gmv, 0));
    const plans = catalog?.plans?.length ? catalog.plans : buildLegacyCatalog({});

    for (const plan of plans) {
        const min = toNum(plan.gmvMin, 0);
        const max = plan.gmvMax === null || plan.gmvMax === undefined ? Infinity : toNum(plan.gmvMax, Infinity);
        if (safeGmv >= min && safeGmv <= max) return plan.id;
    }

    // No band contained it: fall to the nearest tier at or below the amount.
    //
    // Plans are sorted ascending, so the last one whose floor the restaurant
    // clears is the closest below it. Above every band that is the top tier,
    // which is what an unbounded top plan should do anyway; inside a gap left
    // by a retired or mis-edited tier it is the cheaper neighbour. Deliberately
    // not the highest plan: silently charging a mid-sized restaurant the top
    // rate because an admin deactivated the tier it belonged to is a far worse
    // failure than charging it slightly too little.
    let nearestBelow = plans[0];
    for (const plan of plans) {
        if (toNum(plan.gmvMin, 0) <= safeGmv) nearestBelow = plan;
    }
    return nearestBelow.id;
};

/**
 * Problems an admin should be told about before saving a catalog.
 *
 * Returns a list of human-readable strings; empty means the catalog is sound.
 * Deliberately advisory rather than blocking -- an operator mid-edit may
 * legitimately have a temporary gap, and refusing the save would strand them.
 */
export const validatePlanCatalog = (plans = []) => {
    const issues = [];
    const active = (plans || [])
        .filter((p) => p && p.isActive !== false)
        .sort((a, b) => toNum(a.gmvMin, 0) - toNum(b.gmvMin, 0));

    if (active.length === 0) {
        issues.push("No active plans: nothing would be billed.");
        return issues;
    }

    const keys = new Set();
    for (const p of active) {
        const key = String(p.key || "").trim().toLowerCase();
        if (!key) issues.push(`Plan "${p.label || "(unnamed)"}" has no key.`);
        if (keys.has(key)) issues.push(`Duplicate plan key "${key}".`);
        keys.add(key);
        if (p.gmvMax !== null && p.gmvMax !== undefined && toNum(p.gmvMax) < toNum(p.gmvMin)) {
            issues.push(`"${p.label}" has an upper GMV below its lower GMV.`);
        }
    }

    const unbounded = active.filter((p) => p.gmvMax === null || p.gmvMax === undefined);
    if (unbounded.length === 0) {
        issues.push("No plan covers the highest earners: give the top plan an empty maximum GMV.");
    } else if (unbounded.length > 1) {
        issues.push("More than one plan has an empty maximum GMV; only the top plan should.");
    }

    for (let i = 0; i < active.length - 1; i += 1) {
        const cur = active[i];
        const next = active[i + 1];
        if (cur.gmvMax === null || cur.gmvMax === undefined) continue;
        if (toNum(next.gmvMin) > toNum(cur.gmvMax) + 1) {
            issues.push(`Gap between "${cur.label}" and "${next.label}": earnings in between fall to the lower plan.`);
        }
        if (toNum(next.gmvMin) <= toNum(cur.gmvMax)) {
            issues.push(`"${cur.label}" and "${next.label}" overlap; the lower plan wins.`);
        }
    }

    return issues;
};

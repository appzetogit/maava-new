/**
 * Convert the fixed Starter/Growth/Premium columns into the `plans` array the
 * admin panel now edits.
 *
 *   node scripts/migrate-subscription-plans.js            (dry run, prints only)
 *   node scripts/migrate-subscription-plans.js --apply    (writes)
 *   node scripts/migrate-subscription-plans.js --apply --vertical=quick
 *
 * MUST run before the API restarts on the new code -- or rather, it is safe
 * either way, which is the point. buildPlanCatalog() falls back to the legacy
 * columns whenever `plans` is empty, so an un-migrated deployment keeps billing
 * exactly as it did. This script only makes the same three tiers editable.
 *
 * Values are copied across verbatim, including any an operator had already
 * customised. Nothing is priced, banded or renamed differently afterwards: the
 * catalog this produces resolves every GMV to the same plan the hardcoded one
 * did, which is verified below before anything is written.
 *
 * Safe to re-run. A document that already has plans is left alone, so a second
 * run reports 0 and an interrupted run is resumed by running it again.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodRestaurantSubscriptionSettings } from '../src/modules/food/admin/models/restaurantSubscriptionSettings.model.js';
import { buildPlanCatalog, resolveEligiblePlanByGmv } from '../src/modules/food/restaurant/services/subscriptionPlan.service.js';
import { runWithVertical, VERTICALS } from '../src/core/vertical/verticalScope.js';

const APPLY = process.argv.includes('--apply');
const VERTICAL = process.argv.find((a) => a.startsWith('--vertical='))?.split('=')[1] || 'food';

const money = (n) => (n === null || n === undefined ? '∞' : `₹${Number(n).toLocaleString('en-IN')}`);

/**
 * GMV values probed either side of every band edge.
 *
 * Boundaries are where an off-by-one would hide: the legacy bands used
 * fractional edges (30000.01) so a restaurant sitting exactly on 30000 must
 * land in the same plan before and after.
 */
const probePoints = (catalog) => {
    const points = [0, 1];
    for (const plan of catalog.plans) {
        for (const edge of [plan.gmvMin, plan.gmvMax]) {
            if (edge === null || edge === undefined) continue;
            points.push(Math.max(0, edge - 1), edge, edge + 1, edge + 0.5);
        }
    }
    points.push(1e9);
    return [...new Set(points)].sort((a, b) => a - b);
};

async function main() {
    if (!VERTICALS.includes(VERTICAL)) {
        throw new Error(`--vertical must be one of ${VERTICALS.join(', ')}; got "${VERTICAL}"`);
    }
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
    console.log(`connected -> ${mongoose.connection.name}${APPLY ? '' : '  (dry run)'}\n`);

    await runWithVertical(VERTICAL, async () => {
        const docs = await FoodRestaurantSubscriptionSettings.find({});
        if (docs.length === 0) {
            console.log('no subscription settings document; nothing to migrate.');
            return;
        }

        let migrated = 0;
        for (const doc of docs) {
            const raw = doc.toObject();

            if (Array.isArray(raw.plans) && raw.plans.length > 0) {
                console.log(`${raw._id}: already has ${raw.plans.length} plan(s), left alone.`);
                continue;
            }

            // Built from the legacy columns, which is exactly what the running
            // code does today.
            const before = buildPlanCatalog(raw);
            const plans = before.plans.map((p, index) => ({
                key: p.id,
                label: p.label,
                price: p.basePrice,
                gmvMin: p.gmvMin,
                gmvMax: p.gmvMax,
                isActive: true,
                sortOrder: index,
            }));

            const after = buildPlanCatalog({ ...raw, plans });

            // Prove the new catalog bills identically before writing it.
            const mismatches = probePoints(before).filter(
                (gmv) => resolveEligiblePlanByGmv(gmv, before) !== resolveEligiblePlanByGmv(gmv, after),
            );

            console.log(`${raw._id}:`);
            for (const p of plans) {
                console.log(`   ${p.label.padEnd(10)} ${String(money(p.price)).padStart(9)}   ${money(p.gmvMin)} – ${money(p.gmvMax)}`);
            }

            if (mismatches.length > 0) {
                console.log(`   !! ${mismatches.length} GMV value(s) would be billed differently -- NOT migrating this document.`);
                console.log(`      first few: ${mismatches.slice(0, 5).join(', ')}`);
                continue;
            }
            console.log(`   ${probePoints(before).length} boundary probes: identical plan resolution.`);

            if (APPLY) {
                doc.plans = plans;
                await doc.save();
            }
            migrated += 1;
        }

        console.log(
            APPLY
                ? `\nmigrated ${migrated} document(s).`
                : `\ndry run -- ${migrated} document(s) would be migrated. Re-run with --apply.`,
        );
    });

    await mongoose.disconnect();
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e.message || e);
        process.exit(1);
    });

/**
 * Curates the Mart header strip: exactly ten core categories, flagged
 * `showInHeader`, with the previously-seeded tree folded in underneath.
 *
 * Nothing is deleted. A category that gets absorbed keeps its documents and its
 * id; its children are re-parented onto the surviving category and it is then
 * deactivated, so the change is reversible and no product is orphaned.
 *
 *   node scripts/seed-mart-header-categories.js --dry-run
 *   node scripts/seed-mart-header-categories.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { runWithVertical } from '../src/core/vertical/verticalScope.js';

const VERTICAL = 'quick';
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * [display name, categories to absorb]. The first source that already exists is
 * renamed rather than duplicated, so products keep pointing at a live category.
 */
const HEADER = [
    ['Grocery', ['Grocery & Staples', 'Instant & Packaged Food']],
    ['Fruits & Vegetables', ['Fruits & Vegetables']],
    ['Dairy & Bakery', ['Dairy & Bakery']],
    ['Snacks & Beverages', ['Snacks & Munchies', 'Beverages']],
    ['Beauty & Personal Care', ['Personal Care']],
    ['Home & Cleaning', ['Household & Cleaning', 'Home & Kitchen']],
    ['Fashion', ['Fashion & Lifestyle']],
    ['Electronics', ['Electronics & Accessories']],
    ['Baby & Kids', ['Baby Care']],
    ['Pet Care', ['Pet Supplies']]
];

const TOP_LEVEL = { parentId: { $in: [null, undefined] }, vertical: VERTICAL };
const findTop = (name) => FoodCategory.findOne({ ...TOP_LEVEL, name });

const run = async () => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Missing MONGO_URI or MONGODB_URI in Backend/.env');
    await mongoose.connect(mongoUri);
    console.log(`${DRY_RUN ? '[dry run] ' : ''}curating Mart header categories…`);

    await runWithVertical(VERTICAL, async () => {
        const keepIds = [];

        for (let i = 0; i < HEADER.length; i += 1) {
            const [name, sources] = HEADER[i];

            let primary = await findTop(name);
            let renamedFrom = null;
            if (!primary) {
                for (const source of sources) {
                    const candidate = await findTop(source);
                    if (candidate) {
                        renamedFrom = source;
                        primary = candidate;
                        primary.name = name;
                        break;
                    }
                }
            }
            if (!primary) {
                primary = new FoodCategory({
                    name,
                    vertical: VERTICAL,
                    approvalStatus: 'approved',
                    isApproved: true,
                    foodTypeScope: 'Both',
                    image: ''
                });
            }

            primary.showInHeader = true;
            primary.isActive = true;
            primary.sortOrder = i;
            if (!DRY_RUN) await primary.save();
            keepIds.push(primary._id);

            let moved = 0;
            for (const source of sources) {
                const absorbed = await findTop(source);
                if (!absorbed || String(absorbed._id) === String(primary._id)) continue;
                const res = DRY_RUN
                    ? { modifiedCount: await FoodCategory.countDocuments({ parentId: absorbed._id }) }
                    : await FoodCategory.updateMany(
                          { parentId: absorbed._id },
                          { $set: { parentId: primary._id } }
                      );
                moved += res.modifiedCount || 0;
                if (!DRY_RUN) {
                    absorbed.showInHeader = false;
                    // Deactivated, never deleted: its products still reference it.
                    absorbed.isActive = false;
                    await absorbed.save();
                }
            }

            const note = renamedFrom ? ` (renamed from '${renamedFrom}')` : '';
            console.log(`  ${i + 1}. ${name}${note}${moved ? ` — absorbed ${moved} subcategories` : ''}`);
        }

        // Everything else drops out of the header but stays browsable.
        const cleared = DRY_RUN
            ? await FoodCategory.countDocuments({ vertical: VERTICAL, showInHeader: true, _id: { $nin: keepIds } })
            : (await FoodCategory.updateMany(
                  { vertical: VERTICAL, _id: { $nin: keepIds } },
                  { $set: { showInHeader: false } }
              )).modifiedCount;
        console.log(`header categories: ${keepIds.length} | cleared flag on ${cleared} others`);
    });

    if (DRY_RUN) console.log('dry run — nothing was written');
    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});

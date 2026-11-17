/**
 * Seeds the Maava Mart category tree: 16 top-level categories and their
 * subcategories.
 *
 * Idempotent — matches on (vertical, name, parentId) and updates rather than
 * inserting, so re-running after an edit in the admin panel will not create a
 * second copy. Images are left untouched on existing rows: the admin uploads
 * those, and a re-run must never wipe them.
 *
 *   node scripts/seed-mart-categories.js            # create/update
 *   node scripts/seed-mart-categories.js --dry-run  # print what would change
 *
 * Subcategories are FoodCategory rows with `parentId` set — the model's own
 * two-level design — not a separate collection.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { runWithVertical } from '../src/core/vertical/verticalScope.js';

const VERTICAL = 'quick';
const DRY_RUN = process.argv.includes('--dry-run');

/** Order here is the display order: index becomes sortOrder. */
const TREE = [
    ['Grocery & Staples', ['Atta, Flour & Sooji', 'Rice & Grains', 'Dals & Pulses', 'Cooking Oil & Ghee', 'Spices & Masalas', 'Salt & Sugar', 'Dry Fruits & Nuts', 'Breakfast & Cereals', 'Pickles & Chutneys']],
    ['Dairy & Bakery', ['Milk', 'Curd & Yogurt', 'Paneer & Tofu', 'Butter & Cheese', 'Eggs', 'Bread', 'Cakes & Pastries', 'Buns & Bakery Items']],
    ['Fruits & Vegetables', ['Fresh Fruits', 'Fresh Vegetables', 'Leafy Vegetables', 'Exotic Fruits', 'Exotic Vegetables', 'Cut & Packaged Fruits', 'Cut Vegetables', 'Herbs']],
    ['Snacks & Munchies', ['Chips', 'Namkeen', 'Biscuits', 'Cookies', 'Chocolates', 'Popcorn', 'Nuts & Seeds', 'Instant Snacks']],
    ['Beverages', ['Soft Drinks', 'Juices', 'Energy Drinks', 'Sports Drinks', 'Tea', 'Coffee', 'Milkshakes', 'Water', 'Coconut Water']],
    ['Instant & Packaged Food', ['Instant Noodles', 'Pasta', 'Ready-to-Eat', 'Ready-to-Cook', 'Soups', 'Sauces & Ketchup', 'Spreads', 'Frozen Food']],
    ['Personal Care', ['Shampoo', 'Conditioner', 'Hair Care', 'Face Care', 'Skin Care', 'Body Care', 'Oral Care', 'Deodorants & Perfumes', 'Shaving & Grooming', 'Feminine Hygiene']],
    ['Household & Cleaning', ['Laundry', 'Dishwashing', 'Floor & Surface Cleaners', 'Bathroom Cleaners', 'Toilet Cleaners', 'Kitchen Cleaners', 'Garbage Bags', 'Tissues & Paper Towels', 'Air Fresheners']],
    ['Baby Care', ['Baby Food', 'Diapers', 'Baby Wipes', 'Baby Skincare', 'Baby Bath', 'Baby Accessories']],
    ['Pet Supplies', ['Dog Food', 'Cat Food', 'Pet Treats', 'Pet Toys', 'Pet Grooming', 'Pet Hygiene']],
    ['Home & Kitchen', ['Kitchen Essentials', 'Storage & Containers', 'Cookware', 'Kitchen Tools', 'Cleaning Tools', 'Batteries', 'Light Bulbs', 'Home Accessories']],
    ['Health & Wellness', ['Vitamins & Supplements', 'First Aid', 'Pain Relief', 'Digestive Care', 'Health Drinks', 'Personal Wellness', 'Masks & Sanitizers']],
    ['Electronics & Accessories', ['Chargers', 'Cables', 'Earphones', 'Power Banks', 'Batteries', 'Mobile Accessories', 'Small Gadgets']],
    ['Stationery & Office', ['Pens & Pencils', 'Notebooks', 'School Supplies', 'Art & Craft', 'Office Supplies']],
    ['Fashion & Lifestyle', ['Socks', 'Innerwear', 'T-Shirts', 'Slippers', 'Accessories', 'Bags']],
    ['Other / Convenience', ['Gifts', 'Party Supplies', 'Pooja Essentials', 'Travel Essentials', 'Seasonal Products', 'New Arrivals', 'Best Sellers', 'Offers & Deals']]
];

const stats = { createdParents: 0, updatedParents: 0, createdChildren: 0, updatedChildren: 0 };

/**
 * Upserts one category. `parentId: null` is stored as `undefined` because the
 * model treats "unset" as top level; writing an explicit null would make the
 * uniqueness match below miss on a re-run.
 */
const upsert = async ({ name, parentId, sortOrder }) => {
    const filter = { name, vertical: VERTICAL };
    // Two categories may share a name under different parents ('Batteries'
    // appears under both Home & Kitchen and Electronics), so the parent is part
    // of the identity, not just the name.
    if (parentId) filter.parentId = parentId;
    else filter.parentId = { $in: [null, undefined] };

    const existing = await FoodCategory.findOne(filter);
    const isChild = Boolean(parentId);

    if (existing) {
        // Only the fields this script owns. `image` is deliberately absent:
        // an admin-uploaded image must survive a re-run.
        existing.sortOrder = sortOrder;
        existing.isActive = true;
        existing.approvalStatus = 'approved';
        existing.isApproved = true;
        if (parentId) existing.parentId = parentId;
        if (!DRY_RUN) await existing.save();
        stats[isChild ? 'updatedChildren' : 'updatedParents'] += 1;
        return existing._id;
    }

    if (DRY_RUN) {
        stats[isChild ? 'createdChildren' : 'createdParents'] += 1;
        return new mongoose.Types.ObjectId();
    }

    const created = await FoodCategory.create({
        name,
        vertical: VERTICAL,
        parentId: parentId || undefined,
        sortOrder,
        isActive: true,
        approvalStatus: 'approved',
        isApproved: true,
        foodTypeScope: 'Both',
        image: ''
    });
    stats[isChild ? 'createdChildren' : 'createdParents'] += 1;
    return created._id;
};

const run = async () => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Missing MONGO_URI or MONGODB_URI in Backend/.env');

    await mongoose.connect(mongoUri);
    console.log(`${DRY_RUN ? '[dry run] ' : ''}seeding Mart categories…`);

    // The vertical plugin reads the ambient scope, so every write here has to
    // happen inside it or the rows land on 'food' and never show in Mart.
    await runWithVertical(VERTICAL, async () => {
        for (let i = 0; i < TREE.length; i += 1) {
            const [parentName, children] = TREE[i];
            const parentId = await upsert({ name: parentName, parentId: null, sortOrder: i });
            for (let j = 0; j < children.length; j += 1) {
                await upsert({ name: children[j], parentId, sortOrder: j });
            }
        }
    });

    const totalChildren = TREE.reduce((n, [, c]) => n + c.length, 0);
    console.log(
        `categories: +${stats.createdParents} new / ${stats.updatedParents} updated (of ${TREE.length})\n` +
        `subcategories: +${stats.createdChildren} new / ${stats.updatedChildren} updated (of ${totalChildren})`
    );
    if (DRY_RUN) console.log('dry run — nothing was written');

    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});

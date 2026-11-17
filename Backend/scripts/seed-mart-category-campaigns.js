/**
 * One themed campaign per header category, so selecting a category re-themes the
 * whole Mart page — headline, palette, tiles, search hint — from backend data.
 *
 * Tiles are built from each category's OWN subcategories, so they always match
 * the catalogue instead of a hand-written list that drifts.
 *
 *   node scripts/seed-mart-category-campaigns.js --dry-run
 *   node scripts/seed-mart-category-campaigns.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { MartSaleCampaign } from '../src/modules/food/landing/models/martSaleCampaign.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { runWithVertical } from '../src/core/vertical/verticalScope.js';

const VERTICAL = 'quick';
const DRY_RUN = process.argv.includes('--dry-run');

/** name -> [page background, headline ink, search hint, emoji strip]. */
const THEMES = {
    // Tints are deliberately saturated enough to read as "this screen is green"
    // at a glance. Near-white pastels looked like the header had not changed.
    'Grocery': ['#A5DEC0', '#14532D', 'milk', '🥬 🥕 🍅 🥒'],
    'Fruits & Vegetables': ['#B7E9A1', '#1B5E20', 'apples', '🍎 🍌 🥬 🥕'],
    'Dairy & Bakery': ['#FFE49A', '#7A5200', 'butter', '🥛 🧀 🍞 🥚'],
    'Snacks & Beverages': ['#FFCFA3', '#8A3A00', 'chips', '🍿 🍪 🥨 🍫'],
    'Beauty & Personal Care': ['#F9C2D9', '#880E4F', 'lipstick', '🧴 💧 🧼 💄'],
    'Home & Cleaning': ['#B4D9F7', '#0D47A1', 'detergent', '🧹 🧽 🧼 🧴'],
    'Fashion': ['#D6BEF7', '#4A148C', 'socks', '👕 👗 👠 👜'],
    'Electronics': ['#FBE188', '#7A5200', 'chargers', '📱 💻 ⌚ 🎧'],
    'Baby & Kids': ['#A5E4EC', '#004D40', 'diapers', '🍼 🧸 👶 🧴'],
    'Pet Care': ['#F8C7A0', '#8A3A00', 'dog food', '🐶 🐱 🦴 🧴']
};

const DISCOUNTS = ['Up to 55% OFF', 'Up to 45% OFF', 'Up to 35% OFF', 'Up to 25% OFF'];

const run = async () => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Missing MONGO_URI or MONGODB_URI in Backend/.env');
    await mongoose.connect(mongoUri);
    console.log(`${DRY_RUN ? '[dry run] ' : ''}seeding per-category campaigns…`);

    await runWithVertical(VERTICAL, async () => {
        const headers = await FoodCategory.find({
            vertical: VERTICAL,
            showInHeader: true
        }).sort({ sortOrder: 1 });

        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

        for (const category of headers) {
            const theme = THEMES[category.name];
            if (!theme) {
                console.warn(`  ! no theme for '${category.name}' — skipped`);
                continue;
            }
            const [themeColor, accentColor, searchHint, emojis] = theme;

            // The first four subcategories become the tiles.
            const children = await FoodCategory.find({
                vertical: VERTICAL,
                parentId: category._id,
                isActive: true
            }).sort({ sortOrder: 1 }).limit(4);

            const tiles = children.map((child, i) => ({
                title: child.name,
                badgeText: DISCOUNTS[i % DISCOUNTS.length],
                emojis,
                categoryId: child._id,
                sortOrder: i
            }));

            const title = `${category.name.toUpperCase()} SALE`;
            const existing = await MartSaleCampaign.findOne({
                vertical: VERTICAL,
                categoryId: category._id
            });
            const target = existing || new MartSaleCampaign({ categoryId: category._id });

            target.title = title;
            target.dealLabel = 'CRAZY DEALS';
            target.themeColor = themeColor;
            target.accentColor = accentColor;
            target.searchHint = searchHint;
            target.tiles = tiles;
            target.startDate = target.startDate || startDate;
            target.endDate = endDate;
            target.isActive = true;
            target.sortOrder = category.sortOrder;
            if (!DRY_RUN) await target.save();

            console.log(`  ${category.name} → '${title}' ${themeColor} · ${tiles.length} tiles`);
        }
    });

    if (DRY_RUN) console.log('dry run — nothing was written');
    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});

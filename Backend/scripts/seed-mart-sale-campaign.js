/**
 * Seeds the Housefull Sale campaign that the Mart banner used to hard-code.
 *
 * Tiles are bound to REAL category ids looked up by name — the app previously
 * shipped placeholder strings ('wellness', 'meals', 'kitchen') that matched no
 * category, so tapping a tile went nowhere.
 *
 * Idempotent: matches the campaign by title and updates it in place.
 *
 *   node scripts/seed-mart-sale-campaign.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { MartSaleCampaign } from '../src/modules/food/landing/models/martSaleCampaign.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { runWithVertical } from '../src/core/vertical/verticalScope.js';

const VERTICAL = 'quick';
const TITLE = 'HOUSEFULL SALE';

const TILES = [
    { title: 'Self Care &\nWellness', badgeText: 'Up to 55% OFF', emojis: '🧴 💧 🧼 💄', category: 'Personal Care' },
    { title: 'Hot Meals &\nDrinks', badgeText: 'Up to 55% OFF', emojis: '🍜 ☕ 🥛 🍞', category: 'Instant & Packaged Food' },
    { title: 'Kitchen\nEssentials', badgeText: 'Up to 55% OFF', emojis: '🌾 🍚 🫘 🫒', category: 'Grocery & Staples' },
    { title: 'Cleaning &\nHome', badgeText: 'Up to 75% OFF', emojis: '🧹 🧽 🧼 🧴', category: 'Household & Cleaning' }
];

const run = async () => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Missing MONGO_URI or MONGODB_URI in Backend/.env');
    await mongoose.connect(mongoUri);

    await runWithVertical(VERTICAL, async () => {
        const tiles = [];
        for (let i = 0; i < TILES.length; i += 1) {
            const spec = TILES[i];
            const category = await FoodCategory.findOne({
                name: spec.category,
                vertical: VERTICAL,
                parentId: { $in: [null, undefined] }
            }).select('_id');
            if (!category) console.warn(`  ! no category '${spec.category}' — tile will have no link`);
            tiles.push({
                title: spec.title,
                badgeText: spec.badgeText,
                emojis: spec.emojis,
                categoryId: category?._id || null,
                sortOrder: i
            });
        }

        // Runs from today for 30 days. The app renders whatever window is set
        // here, so the strip can never go stale the way the compiled-in
        // '30TH NOV, 2025 - 7TH DEC, 2025' did.
        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

        const existing = await MartSaleCampaign.findOne({ title: TITLE, vertical: VERTICAL });
        if (existing) {
            existing.tiles = tiles;
            existing.isActive = true;
            existing.startDate = existing.startDate || startDate;
            existing.endDate = endDate;
            await existing.save();
            console.log(`updated campaign '${TITLE}' with ${tiles.length} tiles`);
        } else {
            await MartSaleCampaign.create({
                title: TITLE,
                dealLabel: 'CRAZY DEALS',
                tiles,
                startDate,
                endDate,
                isActive: true,
                sortOrder: 0
            });
            console.log(`created campaign '${TITLE}' with ${tiles.length} tiles`);
        }
    });

    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});

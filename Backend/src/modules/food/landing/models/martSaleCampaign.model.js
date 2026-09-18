import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

/**
 * A Mart promotional campaign — the "Housefull Sale" banner and the tiles under
 * it — so the headline, the date range and every tile come from the admin panel
 * instead of being compiled into the app.
 *
 * The app previously shipped these as literals, including a date range
 * ('30TH NOV, 2025 - 7TH DEC, 2025') that went stale and could only be
 * corrected by a store release.
 *
 * One document per campaign; the app renders the highest-priority campaign that
 * is active and inside its date window.
 */
const martSaleTileSchema = new mongoose.Schema(
    {
        /** Tile heading, e.g. 'Self Care & Wellness'. Newlines are honoured. */
        title: { type: String, required: true, trim: true },
        /** e.g. 'Up to 55% OFF'. Free text: the discount shown is whatever the
         *  admin is actually offering, not something derived here. */
        badgeText: { type: String, trim: true, default: '' },
        /** Decorative glyph strip, e.g. '🧴 💧 🧼 💄'. Optional. */
        emojis: { type: String, trim: true, default: '' },
        imageUrl: { type: String, trim: true, default: '' },
        /** Real FoodCategory the tile opens. The app used placeholder strings
         *  ('wellness', 'meals') that matched no category, so the tiles led
         *  nowhere. */
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodCategory',
            default: null
        },
        sortOrder: { type: Number, default: 0 }
    },
    { _id: false }
);

const martSaleCampaignSchema = new mongoose.Schema(
    {
        /** Rendered as the banner headline. Split across lines by the app
         *  exactly as it does today ('HOUSEFULL' / 'SALE'). */
        title: { type: String, required: true, trim: true, default: 'HOUSEFULL SALE' },
        /** Pre-formatted date strip. Optional: when empty the app derives it
         *  from startDate/endDate, so an admin can either write their own copy
         *  or let the dates speak. */
        dateLabel: { type: String, trim: true, default: '' },
        bannerImageUrl: { type: String, trim: true, default: '' },
        /** Label on the deal card, e.g. 'CRAZY DEALS'. */
        dealLabel: { type: String, trim: true, default: 'CRAZY DEALS' },
        /**
         * The header category this campaign themes. Null is the default
         * campaign shown when 'All' is selected.
         *
         * One campaign per category is what lets the whole page re-theme --
         * headline, tiles, colours -- without the app hardcoding a palette per
         * category name.
         */
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodCategory',
            default: null,
            index: true
        },
        /** Page background/accent for this campaign, e.g. '#E8F6EF'. */
        themeColor: { type: String, trim: true, default: '' },
        /** Ink used for the headline on that background, e.g. '#1B5E20'. */
        accentColor: { type: String, trim: true, default: '' },
        /** Placeholder in the search bar, e.g. 'milk' / 'lipstick'. */
        searchHint: { type: String, trim: true, default: '' },
        /** Products featured in the campaign. Empty means the app falls back to
         *  its existing flash-sale ranking, which is already backend data. */
        productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem' }],
        tiles: { type: [martSaleTileSchema], default: [] },
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        isActive: { type: Boolean, default: true, index: true },
        sortOrder: { type: Number, default: 0, index: true }
    },
    {
        collection: 'mart_sale_campaigns',
        timestamps: true
    }
);

martSaleCampaignSchema.plugin(verticalPlugin);
martSaleCampaignSchema.index({ vertical: 1, isActive: 1, sortOrder: 1 });

/**
 * Live campaigns only: active, and inside their window when one is set. A null
 * start or end means "open-ended on that side" rather than "not scheduled", so
 * an admin can launch a campaign without committing to an end date.
 */
martSaleCampaignSchema.statics.findLive = function findLive(now = new Date()) {
    return this.find({
        isActive: true,
        $and: [
            { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
            { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
        ]
    }).sort({ sortOrder: 1, createdAt: -1 });
};

export const MartSaleCampaign = mongoose.model('MartSaleCampaign', martSaleCampaignSchema);

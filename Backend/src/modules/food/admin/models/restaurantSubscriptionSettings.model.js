import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

/**
 * One subscription tier.
 *
 * `key` is what invoices and restaurant records store, so it must not change
 * once a plan has billed anything -- renaming a tier changes `label` only.
 * The admin UI generates a key from the label on create and locks it after.
 *
 * `gmvMax: null` means "no upper bound", which exactly one plan (the top one)
 * should carry. A catalog with none leaves the highest-earning restaurants
 * matching nothing at all.
 */
const subscriptionPlanSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, trim: true, lowercase: true },
        label: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0, default: 0 },
        gmvMin: { type: Number, required: true, min: 0, default: 0 },
        gmvMax: { type: Number, default: null },
        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 }
    },
    { _id: false }
);

const restaurantSubscriptionSettingsSchema = new mongoose.Schema(
    {
        /**
         * The plan catalog. Any number of tiers, ordered by gmvMin.
         *
         * Empty on documents written before this field existed; the catalog
         * builder falls back to the legacy columns below in that case, so a
         * half-deployed cluster keeps billing correctly rather than billing
         * everyone at zero.
         */
        plans: { type: [subscriptionPlanSchema], default: [] },

        /**
         * Legacy fixed-tier columns, kept only as the migration source and the
         * fallback described above. Nothing should read these directly --
         * buildPlanCatalog() is the single entry point.
         *
         * ponytail: droppable once every deployment has run
         * scripts/migrate-subscription-plans.js and `plans` is non-empty
         * everywhere.
         */
        starterPrice: { type: Number, default: 999 },
        growthPrice: { type: Number, default: 1999 },
        premiumPrice: { type: Number, default: 2999 },
        starterMinGmv: { type: Number, default: 0 },
        starterMaxGmv: { type: Number, default: 30000 },
        growthMinGmv: { type: Number, default: 30000.01 },
        growthMaxGmv: { type: Number, default: 60000 },
        premiumMinGmv: { type: Number, default: 60000.01 },

        onboardingFee: { type: Number, required: true, default: 0, min: 0 },
    },
    { collection: 'food_restaurant_subscription_settings', timestamps: true }
);

restaurantSubscriptionSettingsSchema.plugin(verticalPlugin);

export const FoodRestaurantSubscriptionSettings = mongoose.model('FoodRestaurantSubscriptionSettings', restaurantSubscriptionSettingsSchema);

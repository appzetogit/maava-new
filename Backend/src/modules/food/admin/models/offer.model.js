import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const foodOfferSchema = new mongoose.Schema(
    {
        couponCode: { type: String, required: true, trim: true, uppercase: true },
        discountType: { type: String, enum: ['percentage', 'flat-price'], default: 'percentage', index: true },
        discountValue: { type: Number, required: true, min: 0 },
        customerScope: { type: String, enum: ['all', 'first-time'], default: 'all', index: true },
        restaurantScope: { type: String, enum: ['all', 'selected'], default: 'all', index: true },
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant' },
        restaurantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant' }],
        // Where the offer runs. 'all' is every zone, as before; 'selected'
        // limits it to zoneIds, matched against the zone the order is
        // delivered into. With both scopes set, zone and restaurant must match.
        zoneScope: { type: String, enum: ['all', 'selected'], default: 'all', index: true },
        zoneIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone' }],
        minOrderValue: { type: Number, default: 0, min: 0 },
        maxDiscount: { type: Number, default: null, min: 0 },
        usageLimit: { type: Number, default: null, min: 0 },
        /**
         * Redemptions allowed per customer. 1 by default -- a blank field used
         * to save null, which the pricing check reads as unlimited, and that is
         * how one customer ended up using the same code again and again.
         * 0 is the deliberate way to allow unlimited.
         */
        perUserLimit: { type: Number, default: 1, min: 0 },
        usedCount: { type: Number, default: 0, min: 0 },
        startDate: { type: Date },
        isFirstOrderOnly: { type: Boolean, default: false },
        endDate: { type: Date },
        status: { type: String, enum: ['active', 'paused', 'inactive'], default: 'active', index: true },
        showInCart: { type: Boolean, default: true },
        createdByRole: { type: String, enum: ['ADMIN', 'RESTAURANT'], default: 'ADMIN', index: true },
        adminBearPercentage: { type: Number, default: 100, min: 0, max: 100 },
        restaurantBearPercentage: { type: Number, default: 0, min: 0, max: 100 }
    },
    { collection: 'food_offers', timestamps: true }
);

foodOfferSchema.plugin(verticalPlugin);

/**
 * A coupon code is unique per vertical, not globally: SAVE50 on groceries and
 * SAVE50 on restaurant food are two different offers with two different budgets.
 *
 * ponytail: the legacy `couponCode_1` index still exists on deployed clusters;
 * scripts/merge-databases.js drops it.
 */
foodOfferSchema.index({ vertical: 1, couponCode: 1 }, { unique: true });

foodOfferSchema.index({ vertical: 1, restaurantId: 1, createdAt: -1 });
foodOfferSchema.index({ vertical: 1, restaurantIds: 1, createdAt: -1 });

export const FoodOffer = mongoose.model('FoodOffer', foodOfferSchema);

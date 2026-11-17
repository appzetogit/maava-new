import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const foodCategorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        image: { type: String, trim: true, default: '' },
        type: { type: String, trim: true, default: '' },
        foodTypeScope: { type: String, enum: ['Veg', 'Non-Veg', 'Both'], default: 'Both', index: true },
        /**
         * Category scope:
         * - When restaurantId is missing: category is admin/global and can be shared across restaurants.
         * - When restaurantId is set: category is private to that restaurant only.
         *
         * Approval remains available for admin moderation, but approval does not make a
         * restaurant-owned category globally reusable.
         *
         * Note: existing categories (created by admin historically) should be treated as approved.
         */
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', index: true, default: undefined },
        createdByRestaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', index: true, default: undefined },
        approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
        isApproved: { type: Boolean, default: true, index: true },
        rejectionReason: { type: String, trim: true, default: '' },
        requestedAt: { type: Date },
        approvedAt: { type: Date },
        rejectedAt: { type: Date },
        globalizedAt: { type: Date },
        /**
         * Optional zone binding.
         * - When set: category is visible only for that zone.
         * - When null/undefined: category is global (visible for all zones).
         */
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', index: true, default: undefined },
        /**
         * Parent category, giving groceries the second level a menu never
         * needed: "Dairy" holds "Milk", "Curd", "Paneer".
         *
         * One optional pointer rather than a separate subcategory collection —
         * a subcategory is a category in every other respect, and splitting
         * them would fork the approval, zone and scope rules that already work.
         * Unset means top level, which is every existing category.
         * ponytail: two levels is all this supports; deeper nesting needs a
         * real tree, and grocery apps do not use one.
         */
        parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodCategory', index: true, default: undefined },
        /**
         * Whether this category appears in the app's core header strip.
         *
         * The header shows a short, curated set — not every top-level category.
         * Making it a flag keeps that choice with the admin instead of hardcoding
         * a name list in the app, which is exactly how the strip previously ended
         * up advertising categories ('Wedding', 'Winter') that did not exist.
         */
        showInHeader: { type: Boolean, default: false, index: true },
        isActive: { type: Boolean, default: true, index: true },
        sortOrder: { type: Number, default: 0, index: true }
    },
    {
        collection: 'food_categories',
        timestamps: true
    }
);

foodCategorySchema.plugin(verticalPlugin);

foodCategorySchema.index({ vertical: 1, isApproved: 1, createdAt: -1 });
foodCategorySchema.index({ vertical: 1, restaurantId: 1, isApproved: 1, createdAt: -1 });
foodCategorySchema.index({ vertical: 1, approvalStatus: 1, createdAt: -1 });
foodCategorySchema.index({ vertical: 1, createdByRestaurantId: 1, createdAt: -1 });

export const FoodCategory = mongoose.model('FoodCategory', foodCategorySchema);


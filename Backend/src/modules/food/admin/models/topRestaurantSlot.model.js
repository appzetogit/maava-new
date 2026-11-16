import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

/**
 * A paid "Top 10" placement: one restaurant pinned at [rank] in one zone's
 * customer home list between [startAt] and [endAt]. [dailyStart]/[dailyEnd]
 * ("HH:mm", IST) optionally narrow it to a meal window each day; blank means
 * all day. Outside its window the restaurant simply falls back into the
 * normal distance-ordered list — nothing has to run when it expires.
 */
const topRestaurantSlotSchema = new mongoose.Schema(
    {
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', required: true, index: true },
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        rank: { type: Number, required: true, min: 1, max: 10 },
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true, index: true },
        dailyStart: { type: String, default: '', trim: true },
        dailyEnd: { type: String, default: '', trim: true },
        note: { type: String, default: '', trim: true, maxlength: 120 },
    },
    { collection: 'food_top_restaurant_slots', timestamps: true },
);

topRestaurantSlotSchema.plugin(verticalPlugin);

export const FoodTopRestaurantSlot = mongoose.model('FoodTopRestaurantSlot', topRestaurantSlotSchema);

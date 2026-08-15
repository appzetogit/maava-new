import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const foodGourmetRestaurantSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true
        },
        tags: {
            type: [String],
            default: []
        },
        priority: {
            type: Number,
            default: 0,
            index: true
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        }
    },
    {
        collection: 'food_gourmet_restaurants',
        timestamps: true
    }
);

foodGourmetRestaurantSchema.plugin(verticalPlugin);

foodGourmetRestaurantSchema.index({ vertical: 1, restaurantId: 1 });
foodGourmetRestaurantSchema.index({ vertical: 1, isActive: 1, priority: 1 });

export const FoodGourmetRestaurant = mongoose.model('FoodGourmetRestaurant', foodGourmetRestaurantSchema);


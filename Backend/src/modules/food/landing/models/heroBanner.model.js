import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const foodHeroBannerSchema = new mongoose.Schema(
    {
        imageUrl: {
            type: String,
            required: true
        },
        publicId: {
            type: String,
            required: true
        },
        title: {
            type: String
        },
        ctaText: {
            type: String
        },
        ctaLink: {
            type: String
        },
        linkedRestaurantIds: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: 'FoodRestaurant',
            default: []
        },
        sortOrder: {
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
        collection: 'food_hero_banners',
        timestamps: true
    }
);

foodHeroBannerSchema.plugin(verticalPlugin);

foodHeroBannerSchema.index({ vertical: 1, isActive: 1, sortOrder: 1 });

export const FoodHeroBanner = mongoose.model('FoodHeroBanner', foodHeroBannerSchema);


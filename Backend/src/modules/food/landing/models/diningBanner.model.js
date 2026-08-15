import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const foodDiningBannerSchema = new mongoose.Schema(
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
        diningType: {
            type: String
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
        collection: 'food_dining_banners',
        timestamps: true
    }
);

foodDiningBannerSchema.plugin(verticalPlugin);

foodDiningBannerSchema.index({ vertical: 1, isActive: 1, sortOrder: 1 });

export const FoodDiningBanner = mongoose.model('FoodDiningBanner', foodDiningBannerSchema);


import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const homePromotionBannerSchema = new mongoose.Schema(
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
        ctaLink: {
            type: String
        },
        startDate: {
            type: Date,
            default: null
        },
        endDate: {
            type: Date,
            default: null
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
        },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone',
            default: null,
            index: true
        }
    },
    {
        collection: 'food_home_promotion_banners',
        timestamps: true
    }
);

homePromotionBannerSchema.plugin(verticalPlugin);

homePromotionBannerSchema.index({ vertical: 1, isActive: 1, sortOrder: 1 });

export const HomePromotionBanner = mongoose.model('HomePromotionBanner', homePromotionBannerSchema);

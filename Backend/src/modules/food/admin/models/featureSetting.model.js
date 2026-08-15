import mongoose from 'mongoose';

const featureSettingSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, trim: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: '', trim: true },
        isEnabled: { type: Boolean, default: true }
    },
    { collection: 'food_feature_settings', timestamps: true }
);

// The unique index comes from `unique: true` on the field above; declaring it
// again here made mongoose build and maintain the same index twice.

export const FoodFeatureSetting = mongoose.model('FoodFeatureSetting', featureSettingSchema);

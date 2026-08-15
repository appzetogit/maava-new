import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const featureSettingSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, trim: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: '', trim: true },
        isEnabled: { type: Boolean, default: true }
    },
    { collection: 'food_feature_settings', timestamps: true }
);

featureSettingSchema.plugin(verticalPlugin);

/**
 * A feature flag key is unique per vertical, not globally: the food and quick
 * catalogues can both have a 'dining' flag set differently.
 *
 * ponytail: the legacy unique index `key_1` still exists on deployed
 * clusters and must be dropped before the two databases merge -- until then
 * it rejects the second vertical's copy of any given key. Nothing collides
 * while each database holds one vertical, so the drop belongs with the phase 5
 * migration.
 */
featureSettingSchema.index({ vertical: 1, key: 1 }, { unique: true });

export const FoodFeatureSetting = mongoose.model('FoodFeatureSetting', featureSettingSchema);

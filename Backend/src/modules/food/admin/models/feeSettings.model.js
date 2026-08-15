import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const deliveryFeeRangeSchema = new mongoose.Schema(
    {
        min: { type: Number, required: true, min: 0 },
        max: { type: Number, required: true, min: 0 },
        fee: { type: Number, required: true, min: 0 },
        deliveryBoyPerKm: { type: Number, min: 0, default: 0 },
        deliveryBoyBasePay: { type: Number, min: 0, default: 0 }
    },
    { _id: false }
);

const feeSettingsSchema = new mongoose.Schema(
    {
        // No defaults here; admin must explicitly configure values.
        deliveryFee: { type: Number, min: 0 },
        deliveryFeeRanges: { type: [deliveryFeeRangeSchema], default: [] },
        platformFee: { type: Number, min: 0 },
        quickDeliveryFee: { type: Number, min: 0 },
        gstRate: { type: Number, min: 0, max: 100 },
        /**
         * Minutes the seller spends picking and packing before a rider can
         * leave, used in the delivery promise.
         *
         * Was PACKING_MINUTES in the environment. Env vars are per-process, and
         * from the phase 5 merge one process serves both verticals -- so a
         * number that genuinely differs between a kitchen and a grocery shelf
         * cannot live there any more. `null` falls back to the env value, then
         * to 3, so an unconfigured deployment behaves exactly as before.
         */
        packingMinutes: { type: Number, min: 0, default: null },
        /**
         * Rider search radius per dispatch attempt, in km. Widens with each
         * failed attempt.
         *
         * Was DISPATCH_RADIUS_BANDS_KM, and moved here for the same reason: food
         * ran 15/25/40/60 and quick runs 3/5/8/12, which one process cannot hold
         * in one env var. Empty falls back to the env value, then to 3,5,8,12.
         */
        dispatchRadiusBandsKm: { type: [Number], default: [] },
        isActive: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_fee_settings', timestamps: true }
);

feeSettingsSchema.plugin(verticalPlugin);

feeSettingsSchema.index({ vertical: 1, isActive: 1, createdAt: -1 });

export const FoodFeeSettings = mongoose.model('FoodFeeSettings', feeSettingsSchema);


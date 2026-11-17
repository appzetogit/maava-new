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
        /**
         * The zone these fees apply to. null is the default record every zone
         * falls back to, so adding a zone changes nothing until it is given its
         * own fees, and a zone record may override as little as the delivery fee.
         */
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null, index: true },
        // No defaults here; admin must explicitly configure values.
        deliveryFee: { type: Number, min: 0 },
        deliveryFeeRanges: { type: [deliveryFeeRangeSchema], default: [] },
        platformFee: { type: Number, min: 0 },
        /** Order value at or above which delivery is free. Null means the
         *  shop does not run the offer, and the app hides the progress bar
         *  rather than inventing a target. The fee table itself is
         *  distance-banded, so this is a separate, order-value rule. */
        freeDeliveryThreshold: { type: Number, min: 0, default: null },
        /**
         * Tip amounts offered on the cart's "Tip your delivery partner" card,
         * in display order. Empty means the app falls back to its own defaults,
         * so an unconfigured store still shows a working tip card.
         */
        tipPresets: { type: [Number], default: [] },
        /**
         * Distance pricing: baseDeliveryFee covers everything up to
         * baseDeliveryKm, then perKmFee is charged for each started kilometre
         * beyond it, never more than maxDeliveryFee when that is set. Leave
         * baseDeliveryFee or baseDeliveryKm unset and the zone keeps using the
         * distance bands (deliveryFeeRanges), then the flat deliveryFee.
         */
        baseDeliveryKm: { type: Number, min: 0, default: null },
        baseDeliveryFee: { type: Number, min: 0, default: null },
        perKmFee: { type: Number, min: 0, default: null },
        maxDeliveryFee: { type: Number, min: 0, default: null },
        /**
         * Rider pay, the same shape: riderBasePay covers everything up to
         * riderBaseKm, then riderPerKmPay for each kilometre beyond it (pro
         * rata), never more than riderMaxPay when that is set. Set, it replaces
         * the per-band rider pay below; left blank, the bands apply as before.
         */
        riderBaseKm: { type: Number, min: 0, default: null },
        riderBasePay: { type: Number, min: 0, default: null },
        riderPerKmPay: { type: Number, min: 0, default: null },
        riderMaxPay: { type: Number, min: 0, default: null },
        /**
         * A welcome for people who just joined: delivery is free for their first
         * newCustomerFreeDeliveryOrders delivered orders, and/or for
         * newCustomerFreeDeliveryDays after they signed up. Whichever limits are
         * set must all still hold; newCustomerMinOrder can require a basket size.
         * The rider is still paid for these trips.
         */
        newCustomerFreeDelivery: { type: Boolean, default: false },
        newCustomerFreeDeliveryOrders: { type: Number, min: 0, default: null },
        newCustomerFreeDeliveryDays: { type: Number, min: 0, default: null },
        newCustomerMinOrder: { type: Number, min: 0, default: null },
        /**
         * Packaging, charged to the customer and paid to the restaurant with
         * the food (restaurantPayout.util adds it to the seller's net). A flat
         * amount per order, plus an optional per-item amount for kitchens that
         * box each dish separately. Both null means no packaging charge, which
         * is how every order behaved until now.
         */
        packagingFee: { type: Number, min: 0, default: null },
        packagingFeePerItem: { type: Number, min: 0, default: null },
        quickDeliveryFee: { type: Number, min: 0 },
        gstRate: { type: Number, min: 0, max: 100 },
        /**
         * GST charged specifically on the delivery fee (a distinct supply of
         * service from the food itself, commonly taxed at the standard rate
         * regardless of what slab the items are in). Was a fixed 18% constant
         * in code with no admin control at all; null falls back to that same
         * 18% default so an unconfigured store's total does not change.
         */
        deliveryFeeGstRate: { type: Number, min: 0, max: 100 },
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
feeSettingsSchema.index({ vertical: 1, zoneId: 1 });

export const FoodFeeSettings = mongoose.model('FoodFeeSettings', feeSettingsSchema);


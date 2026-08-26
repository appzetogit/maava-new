import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const earningAddonHistorySchema = new mongoose.Schema(
    {
        offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodEarningAddon', required: true, index: true },
        deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', required: true, index: true },

        /**
         * Which multiple of `requiredOrders` this row paid for: 0 for the first
         * award, 1 for the second, and so on. Non-repeatable offers only ever
         * write cycle 0, which is what makes the unique index below a
         * once-per-rider guarantee for them without a second code path.
         */
        cycle: { type: Number, default: 0, min: 0 },

        ordersCompleted: { type: Number, default: 0 },
        ordersRequired: { type: Number, default: 0 },

        earningAmount: { type: Number, default: 0 },
        totalEarning: { type: Number, default: 0 },

        status: { type: String, enum: ['pending', 'credited', 'failed', 'cancelled'], default: 'pending', index: true },
        completedAt: { type: Date, default: Date.now, index: true },

        creditedAt: { type: Date },
        creditedNotes: { type: String, trim: true, default: '' },

        cancelledAt: { type: Date },
        cancelReason: { type: String, trim: true, default: '' }
    },
    { collection: 'food_earning_addon_history', timestamps: true }
);

earningAddonHistorySchema.plugin(verticalPlugin);

earningAddonHistorySchema.index({ deliveryPartnerId: 1, completedAt: -1 });
earningAddonHistorySchema.index({ offerId: 1, deliveryPartnerId: 1, status: 1 });

/**
 * The idempotency lock, not merely an optimisation.
 *
 * Awarding used to read for an existing row and then create one, which is a
 * check-then-act race: two deliveries completing at the same moment both saw no
 * row and both paid. The award path now creates this row FIRST and treats the
 * duplicate-key error as "someone else already paid this cycle", so the
 * database decides the winner instead of the interleaving.
 *
 * Cancelled rows are included deliberately. A cancelled award still occupies its
 * cycle -- an admin rejecting a payout should not hand the rider another attempt
 * at the same one on their next delivery.
 */
earningAddonHistorySchema.index(
    { vertical: 1, offerId: 1, deliveryPartnerId: 1, cycle: 1 },
    { unique: true }
);

export const FoodEarningAddonHistory = mongoose.model('FoodEarningAddonHistory', earningAddonHistorySchema);

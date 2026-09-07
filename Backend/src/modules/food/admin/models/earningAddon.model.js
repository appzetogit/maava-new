import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const earningAddonSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, index: true },
        description: { type: String, trim: true, default: '' },
        requiredOrders: { type: Number, required: true, min: 1 },
        earningAmount: { type: Number, required: true, min: 0 },
        startDate: { type: Date, required: true, index: true },
        endDate: { type: Date, required: true, index: true },
        maxRedemptions: { type: Number, min: 1, default: null },
        currentRedemptions: { type: Number, default: 0 },

        /**
         * Pays again on every further multiple of `requiredOrders` instead of
         * once per rider, for the "5 deliveries -> Rs.100, and so on" shape.
         *
         * A one-shot offer stops at cycle 0. A repeatable one awards cycle 0 at
         * 5 deliveries, cycle 1 at 10, cycle 2 at 15 -- each its own history row,
         * so the ledger still shows what was paid for what.
         */
        repeatable: { type: Boolean, default: false },

        /**
         * Move the money the moment the rider qualifies, rather than parking a
         * `pending` row for an admin to approve.
         *
         * Defaults to false: every payout on this collection has passed an
         * admin's eye until now, and turning that off for existing offers as a
         * side effect of a deploy is not a decision a schema default should make.
         */
        autoCredit: { type: Boolean, default: false },

        status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true }
    },
    { collection: 'food_earning_addons', timestamps: true }
);

earningAddonSchema.plugin(verticalPlugin);

earningAddonSchema.index({ vertical: 1, status: 1, startDate: 1, endDate: 1 });

export const FoodEarningAddon = mongoose.model('FoodEarningAddon', earningAddonSchema);

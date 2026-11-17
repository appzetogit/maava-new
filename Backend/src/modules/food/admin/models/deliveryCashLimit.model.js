import mongoose from 'mongoose';

const deliveryCashLimitSchema = new mongoose.Schema(
    {
        deliveryCashLimit: { type: Number, default: 0, min: 0 },
        deliveryWithdrawalLimit: { type: Number, default: 100, min: 0 },
        /**
         * Wallet balance a rider must keep to be offered NEW orders.
         *
         * 0 means "no minimum", the default, so installs that never configured
         * this keep dispatching to everyone. Lives here rather than in a new
         * collection because it is the same kind of setting as the two above:
         * one global rider money limit, deliberately NOT vertical-scoped — a
         * rider's wallet is one pot across Food and Mart, so one threshold
         * governs both.
         *
         * Only ever gates NEW offers. A trip already accepted is never touched
         * if the balance drops mid-delivery.
         */
        minWalletBalanceForOrders: { type: Number, default: 0, min: 0 },
        isActive: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_delivery_cash_limits', timestamps: true }
);

/**
 * Deliberately NOT vertical-scoped, unlike the other settings.
 *
 * This caps how much cash a rider may hold before they must deposit it, and the
 * rider's cashInHand is a single shared balance across both verticals. A rider
 * carrying 4,000 from food orders and 3,000 from grocery orders is holding
 * 7,000; two separate limits applied to one pot is not a stricter rule, it is a
 * meaningless one.
 *
 * Delivery COMMISSION rules stay scoped, because those are read per order to
 * compute a payout, and a grocery run may legitimately pay differently.
 */
deliveryCashLimitSchema.index({ isActive: 1, createdAt: -1 });

export const FoodDeliveryCashLimit = mongoose.model('FoodDeliveryCashLimit', deliveryCashLimitSchema);


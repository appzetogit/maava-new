import mongoose from 'mongoose';

/**
 * A manual correction to a restaurant's wallet: a credit (positive amount) or
 * a debit (negative), always with the reason and who made it.
 *
 * The wallet balance is worked out from orders and withdrawals every time it
 * is read, so there is nowhere to "edit" a balance. A correction is recorded
 * here instead and added in, which keeps every rupee traceable: carrying over
 * a balance from the old system, settling a dispute, or reversing a mistake.
 * Rows are never edited or deleted; a wrong adjustment is undone with another.
 */
const restaurantWalletAdjustmentSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            validate: {
                validator: (v) => Number.isFinite(v) && v !== 0,
                message: 'Adjustment amount must be a non-zero number.',
            },
        },
        reason: { type: String, required: true, trim: true, maxlength: 500 },
        createdBy: {
            role: { type: String, default: 'ADMIN' },
            id: { type: mongoose.Schema.Types.ObjectId, default: null },
            name: { type: String, default: '' },
        },
    },
    { collection: 'food_restaurant_wallet_adjustments', timestamps: true },
);

restaurantWalletAdjustmentSchema.index({ restaurantId: 1, createdAt: -1 });

export const FoodRestaurantWalletAdjustment = mongoose.model(
    'FoodRestaurantWalletAdjustment',
    restaurantWalletAdjustmentSchema,
);

import mongoose from 'mongoose';

/**
 * Admin-configured limits for customer wallet top-ups.
 *
 * One document for the whole platform, not per vertical: a customer's wallet is
 * one pot across Food and Mart, so one pair of limits applies to both.
 */
const walletSettingsSchema = new mongoose.Schema(
    {
        /** Singleton key. */
        key: { type: String, default: 'platform', unique: true },
        /** Smallest top-up in rupees. */
        minTopup: { type: Number, min: 1, default: 100 },
        /** Largest single top-up in rupees. */
        maxTopup: { type: Number, min: 1, default: 50000 }
    },
    { collection: 'food_wallet_settings', timestamps: true }
);

export const FoodWalletSettings = mongoose.model('FoodWalletSettings', walletSettingsSchema);

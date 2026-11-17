import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

/**
 * AdminWallet — tracks the platform's overall financial balance.
 * Credited with platform fees + delivery fee margins on every order.
 * This represents the platform's revenue.
 */
const adminWalletSchema = new mongoose.Schema(
    {
        /**
         * Singleton key — one admin wallet per vertical.
         *
         * `unique` moved off the field and onto the compound index below. The
         * value stays 'platform' rather than becoming 'platform:food': the
         * scoping plugin already separates the two rows, so every existing
         * findOne({ key: 'platform' }) keeps working untouched. Encoding the
         * vertical into the value would have meant editing each call site to
         * build the key, for no gain.
         */
        key: { type: String, default: 'platform' },
        balance: { type: Number, default: 0 },
        /** Lifetime total platform revenue */
        totalRevenue: { type: Number, default: 0, min: 0 },
        /** Total paid out to restaurants + delivery partners */
        totalPayouts: { type: Number, default: 0, min: 0 },
        /** Total refunds issued */
        totalRefunds: { type: Number, default: 0, min: 0 }
    },
    { collection: 'food_admin_wallets', timestamps: true }
);

adminWalletSchema.plugin(verticalPlugin);

/**
 * Platform revenue has to be attributable per vertical, so there is one wallet
 * row each rather than one shared pot.
 *
 * ponytail: the legacy single-field unique index `key_1` still exists on
 * deployed clusters and must be dropped before the two databases merge -- until
 * then it would reject the second vertical's 'platform' row. Nothing collides
 * while each database holds one vertical, so the drop belongs with the phase 5
 * migration, not here.
 */
adminWalletSchema.index({ vertical: 1, key: 1 }, { unique: true });

export const FoodAdminWallet = mongoose.model('FoodAdminWallet', adminWalletSchema);

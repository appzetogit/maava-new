import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodWalletSettings } from '../../admin/models/walletSettings.model.js';

export const WALLET_TOPUP_DEFAULTS = Object.freeze({ minTopup: 100, maxTopup: 50000 });
/** Hard ceiling on what an admin can allow for one top-up. */
const MAX_TOPUP_CEILING = 500000;

/**
 * Bad or missing values fall back to the defaults, never to "anything goes":
 * users were topping up 1 at a time from many UPI IDs when no minimum applied.
 */
const normalize = (doc) => {
    let minTopup = Number(doc?.minTopup);
    let maxTopup = Number(doc?.maxTopup);
    if (!Number.isFinite(minTopup) || minTopup < 1) minTopup = WALLET_TOPUP_DEFAULTS.minTopup;
    if (!Number.isFinite(maxTopup) || maxTopup < minTopup || maxTopup > MAX_TOPUP_CEILING) {
        maxTopup = Math.max(WALLET_TOPUP_DEFAULTS.maxTopup, minTopup);
    }
    return { minTopup, maxTopup };
};

export const getWalletTopupLimits = async () => {
    try {
        const doc = await FoodWalletSettings.findOne({ key: 'platform' }).lean();
        return normalize(doc);
    } catch {
        return { ...WALLET_TOPUP_DEFAULTS };
    }
};

export const saveWalletTopupLimits = async (body = {}) => {
    const current = await getWalletTopupLimits();
    const minTopup = body.minTopup === undefined ? current.minTopup : Number(body.minTopup);
    const maxTopup = body.maxTopup === undefined ? current.maxTopup : Number(body.maxTopup);

    if (!Number.isFinite(minTopup) || minTopup < 1) {
        throw new ValidationError('Minimum top-up must be at least ₹1');
    }
    if (!Number.isFinite(maxTopup) || maxTopup < minTopup) {
        throw new ValidationError('Maximum top-up must be at least the minimum');
    }
    if (maxTopup > MAX_TOPUP_CEILING) {
        throw new ValidationError(`Maximum top-up cannot exceed ₹${MAX_TOPUP_CEILING.toLocaleString('en-IN')}`);
    }

    const doc = await FoodWalletSettings.findOneAndUpdate(
        { key: 'platform' },
        { $set: { minTopup, maxTopup } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return normalize(doc);
};

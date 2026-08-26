import mongoose from 'mongoose';
import { FoodUser } from '../users/user.model.js';

/**
 * Characters a referral code is built from.
 *
 * No 0/O/1/I/L: the code is read off a screen and typed into someone else's
 * phone, and those are the pairs people get wrong.
 */
export const REFERRAL_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

const randomCode = () => {
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
        out += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)];
    }
    return out;
};

/** How a code is written down, wherever it came from. */
export const normalizeReferralCode = (raw) => String(raw || '').trim().toUpperCase();

/**
 * A short code nobody else holds.
 *
 * Collisions are retried rather than assumed away — 31^6 is large, but "large"
 * is not "never", and a duplicate code would credit the wrong person.
 *
 * `users` is injectable so this can be exercised without a database.
 */
export const generateUniqueReferralCode = async (attempts = 8, users = FoodUser) => {
    for (let i = 0; i < attempts; i += 1) {
        const code = randomCode();
        const taken = await users.exists({ referralCode: code });
        if (!taken) return code;
    }
    // Astronomically unlikely; a longer code is still better than a duplicate.
    return `${randomCode()}${randomCode()}`;
};

/**
 * The user a `ref` value points at, by referral code or by id.
 *
 * Both, because links shared before short codes existed carry the referrer's
 * ObjectId, and those invites are still out there.
 */
export const findReferrerByRef = async (ref, users = FoodUser) => {
    const code = normalizeReferralCode(ref);
    if (!code) return null;

    const byCode = await users.findOne({ referralCode: code }).select('_id').lean();
    if (byCode) return byCode;

    if (!mongoose.Types.ObjectId.isValid(code)) return null;
    return users.findById(String(ref).trim()).select('_id').lean();
};

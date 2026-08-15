/**
 * The decisions a two-database merge has to make, as pure functions.
 *
 * Separated from the scripts that read and write MongoDB so the parts that can
 * be wrong in a way nobody notices -- which record survives, how two wallet
 * balances combine, what an order gets renumbered to -- are testable without a
 * database, and are reviewed as logic rather than as loops.
 *
 * Nothing here touches mongoose. Everything takes plain objects and returns a
 * plan; the caller applies it.
 */

/**
 * Indian mobile numbers are stored inconsistently across these two databases:
 * '+91 98765 43210', '919876543210', '9876543210' are one person. Matching on
 * the raw string would merge nothing and silently create duplicate customers
 * with split wallets.
 *
 * Last 10 digits, because that is the part that identifies the subscriber. A
 * shorter string is returned as-is rather than padded, so a malformed number
 * cannot collide with a real one by accident.
 */
export const normalizePhone = (value) => {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.length > 10 ? digits.slice(-10) : digits;
};

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

/**
 * Group records from both databases by identity key.
 *
 * Returns a Map of key -> { food, quick } so the caller can see, for every
 * identity, whether it exists on one side or both. Records with a blank key are
 * reported separately rather than lumped under '' -- they cannot be matched, and
 * silently merging every one of them into a single record would be catastrophic.
 */
export const pairByKey = (foodDocs, quickDocs, keyOf) => {
    const pairs = new Map();
    const unkeyed = { food: [], quick: [] };

    const add = (docs, side) => {
        for (const doc of docs) {
            const key = keyOf(doc);
            if (!key) { unkeyed[side].push(doc); continue; }
            if (!pairs.has(key)) pairs.set(key, { key, food: null, quick: null });
            const slot = pairs.get(key);
            // A duplicate WITHIN one database is a pre-existing data problem, not
            // something the merge introduced. Keep the first and record the rest;
            // the report shows them so a human decides before anything is written.
            if (slot[side]) (slot.duplicates ||= []).push({ side, doc });
            else slot[side] = doc;
        }
    };
    add(foodDocs, 'food');
    add(quickDocs, 'quick');

    return { pairs, unkeyed };
};

/**
 * Combine two wallet documents for the same person.
 *
 * Balances SUM. This is the single most important line in the merge: a customer
 * who has 200 in the food app and 150 in the grocery app must end with 350, not
 * whichever record happened to be written second. Every monetary field is
 * additive for the same reason -- they are all running totals.
 *
 * Non-monetary scalars take the food side, which is the surviving record.
 */
export const MONEY_FIELDS = Object.freeze([
    'balance',
    'referralEarnings',
    'lockedAmount',
    'cashInHand',
    'totalEarnings',
    'totalBonus',
    'totalSettled',
    'totalDeliveries',
    'totalRevenue',
    'totalPayouts',
    'totalRefunds',
]);

export const mergeWallets = (foodWallet, quickWallet) => {
    if (!foodWallet) return quickWallet ? { ...quickWallet } : null;
    if (!quickWallet) return { ...foodWallet };

    const merged = { ...foodWallet };
    for (const field of MONEY_FIELDS) {
        const a = Number(foodWallet[field]);
        const b = Number(quickWallet[field]);
        if (!Number.isFinite(a) && !Number.isFinite(b)) continue;
        merged[field] = (Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0);
    }

    // Embedded ledgers concatenate, oldest first, so the statement still reads
    // in order after the merge.
    if (Array.isArray(foodWallet.transactions) || Array.isArray(quickWallet.transactions)) {
        merged.transactions = [
            ...(foodWallet.transactions || []),
            ...(quickWallet.transactions || []),
        ].sort((x, y) => new Date(x?.createdAt || 0) - new Date(y?.createdAt || 0));
    }

    return merged;
};

/**
 * Human-readable order numbers restart per database, so the two sets overlap.
 *
 * Prefixed rather than renumbered. Renumbering would invalidate every support
 * ticket, invoice PDF and customer screenshot in existence; a prefix keeps the
 * original visible and makes the id globally unique, which also means the unique
 * index needs no compound rebuild.
 *
 * Already-prefixed ids pass through untouched, so the migration is idempotent.
 */
export const ORDER_ID_PREFIX = Object.freeze({ food: 'FD-', quick: 'QC-' });

export const prefixOrderId = (orderId, vertical) => {
    const prefix = ORDER_ID_PREFIX[vertical];
    if (!prefix) throw new Error(`unknown vertical: ${vertical}`);
    const raw = String(orderId ?? '');
    if (!raw) return raw;
    if (raw.startsWith(prefix)) return raw;
    // A quick-commerce id must not end up double-prefixed if a partial run is
    // resumed, and must not be given the food prefix by a mistaken second pass.
    for (const other of Object.values(ORDER_ID_PREFIX)) {
        if (raw.startsWith(other)) return raw;
    }
    return `${prefix}${raw}`;
};

/**
 * Build the id remapping for one identity collection.
 *
 * Where the same person exists on both sides, the FOOD record survives and the
 * quick record's _id is remapped onto it. Food is the surviving side because it
 * is the target database -- keeping its ids stable means its orders, wallets and
 * tokens need no rewriting at all, which halves the number of documents the
 * migration touches and therefore halves what can go wrong.
 *
 * Returns { remap, carryOver, merges }:
 *   remap     Map of quickId -> foodId, for references that must be rewritten
 *   carryOver quick docs with no food counterpart; they move across unchanged
 *   merges    the pairs, so wallets and counters can be combined by the caller
 */
export const planIdentityMerge = ({ foodDocs, quickDocs, keyOf, idOf = (d) => String(d._id) }) => {
    const { pairs, unkeyed } = pairByKey(foodDocs, quickDocs, keyOf);

    const remap = new Map();
    const carryOver = [];
    const merges = [];

    for (const slot of pairs.values()) {
        if (slot.food && slot.quick) {
            remap.set(idOf(slot.quick), idOf(slot.food));
            merges.push(slot);
        } else if (slot.quick) {
            carryOver.push(slot.quick);
        }
    }

    // Unkeyed quick records cannot be matched to anyone, so they move across as
    // new records rather than being dropped. Losing them would lose their orders.
    carryOver.push(...unkeyed.quick);

    return { remap, carryOver, merges, unkeyed, pairs };
};

/**
 * Total of one money field across a set of wallet documents.
 *
 * The merge's headline invariant: run it over both databases before, and over
 * the merged database after. If the two differ by any amount, the migration
 * moved money and must be rolled back rather than investigated in production.
 */
export const sumMoney = (docs, field = 'balance') => docs.reduce((total, doc) => {
    const value = Number(doc?.[field]);
    return Number.isFinite(value) ? total + value : total;
}, 0);

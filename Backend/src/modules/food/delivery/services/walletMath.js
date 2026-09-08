/**
 * Pure wallet arithmetic for delivery partners.
 *
 * Lives on its own so the two places that compute a rider's balance — the
 * rider-facing pocket screen (deliveryFinance.service) and the admin wallet
 * list (admin.service, which also decides who is below the new-order floor) —
 * share one formula instead of two copies that drift apart. No database, no
 * imports, so it can be checked with plain asserts:
 * `node scripts/check-min-wallet-balance.js`.
 */

/**
 * A rider's spendable wallet balance.
 *
 * Earnings, bonuses and wallet top-ups go in; approved and in-flight
 * withdrawals come out; and so does any COD cash they have collected but not
 * yet deposited, because that is the company's money sitting in their pocket.
 * Depositing it raises the balance again on its own, since cashInHand is
 * collected-minus-deposited.
 *
 * Never negative: a rider deep in undeposited cash reads as ₹0, not as a debt.
 */
export function computePocketBalance({
    totalEarned = 0,
    totalBonus = 0,
    topUps = 0,
    totalWithdrawn = 0,
    pendingWithdrawals = 0,
    cashInHand = 0,
} = {}) {
    const credits =
        (Number(totalEarned) || 0) + (Number(totalBonus) || 0) + (Number(topUps) || 0);
    const debits =
        (Number(totalWithdrawn) || 0) +
        (Number(pendingWithdrawals) || 0) +
        (Number(cashInHand) || 0);
    return Math.max(0, credits - debits);
}

/**
 * The one comparison the new-order wallet floor turns on.
 *
 * A floor of 0 (or less) means the rule is off, and a balance exactly ON the
 * floor still passes — the admin sets a minimum to hold, not to exceed.
 */
export function isBelowWalletMinimum(balance, minimum) {
    const floor = Number(minimum) || 0;
    if (floor <= 0) return false;
    return (Number(balance) || 0) < floor;
}

/**
 * The one comparison the cash-in-hand ceiling turns on.
 *
 * A limit of 0 (or less) means the rule is off, and cash in hand exactly ON
 * the limit already blocks — the ceiling is a cap to stay under, not a floor
 * to clear.
 */
export function isAtOrAboveCashLimit(cashInHand, limit) {
    const ceiling = Number(limit) || 0;
    if (ceiling <= 0) return false;
    return (Number(cashInHand) || 0) >= ceiling;
}

/**
 * COD cash a rider is still holding: collected minus handed in.
 *
 * Floored at zero. A rider who over-deposits, or whose deposits were recorded
 * ahead of their orders, must read as holding nothing rather than negative,
 * which would otherwise hand them extra headroom against the ceiling.
 */
export function computeCashInHand(grossCashCollected, totalDepositedCash) {
    return Math.max(0, (Number(grossCashCollected) || 0) - (Number(totalDepositedCash) || 0));
}

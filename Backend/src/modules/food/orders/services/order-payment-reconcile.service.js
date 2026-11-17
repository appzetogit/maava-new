import { FoodOrder } from '../models/order.model.js';
import { runWithVertical } from '../../../../core/vertical/verticalScope.js';
import { config } from '../../../../config/env.js';
import { logger } from '../../../../utils/logger.js';
import {
    isRazorpayConfigured,
    fetchRazorpayOrder,
    fetchRazorpayOrderPayments,
    listRazorpayPayments,
} from '../helpers/razorpay.helper.js';
import {
    refundRazorpayPaymentOnce,
    listRetryableRefunds,
    MAX_REFUND_ATTEMPTS,
} from '../../../../core/payments/razorpayRefund.service.js';
import {
    confirmPaidOnlineOrder,
    cancelPaidPendingOrderAndRefund,
    sweepStalePendingPaymentOrders,
} from './order.service.js';

/**
 * What to do with a captured Razorpay payment. Used by the webhook
 * (payment.captured, order.paid) and by the 5-minute reconciliation job, so
 * whichever sees a payment first acts and the others find it already handled.
 *
 *  - order waiting for payment   -> confirm it (sent to the restaurant)
 *  - confirming it throws        -> cancel the order and refund
 *  - amount is not the total     -> cancel the order and refund what was paid
 *  - order already paid by another payment -> refund this one (paid twice)
 *  - order cancelled             -> refund this payment if nothing has
 *  - no order at all (deleted after an abandoned checkout) -> refund
 *  - not an order payment (wallet top-up, rider deposit, QR collect) -> ignore
 *
 * Returns a short outcome string for logs.
 */
export async function settleCapturedRazorpayPayment(payment, { source = 'unknown' } = {}) {
    const paymentId = String(payment?.id || '').trim();
    const rzOrderId = String(payment?.order_id || '').trim();
    const status = String(payment?.status || '').toLowerCase();
    const paidPaise = Number(payment?.amount);

    if (!paymentId || !rzOrderId) return 'ignored_no_order_id';
    // Only captured money is settled here. An authorized payment is captured
    // automatically a moment later, and that capture brings it back here.
    if (status !== 'captured') return `ignored_status_${status || 'unknown'}`;

    // Both verticals: the webhook and the job run outside any request scope.
    const order = await FoodOrder.findOne({ 'payment.razorpay.orderId': rzOrderId })
        .setOptions({ skipVerticalScope: true });

    if (!order) return settleOrphanPayment({ paymentId, rzOrderId, paidPaise, source });

    return runWithVertical(order.vertical || config.defaultVertical, async () => {
        const orderStatus = String(order.orderStatus || '');
        const payStatus = String(order.payment?.status || '').toLowerCase();
        const recordedPaymentId = String(order.payment?.razorpay?.paymentId || '');
        const expectedPaise = Math.round((Number(order.pricing?.total) || 0) * 100);
        const refundBase = {
            paymentId,
            amount: paidPaise / 100,
            source,
            orderId: order._id,
            razorpayOrderId: rzOrderId,
            vertical: order.vertical || '',
        };

        // This payment is the one on record: nothing to do (repeat webhook, job re-run).
        if (recordedPaymentId === paymentId && ['paid', 'refunded'].includes(payStatus)) {
            return 'already_settled';
        }

        // Paid twice on the same checkout (a retry after the app reported failure).
        if (recordedPaymentId && recordedPaymentId !== paymentId && ['paid', 'refunded'].includes(payStatus)) {
            const r = await refundRazorpayPaymentOnce({ ...refundBase, reason: 'duplicate_payment' });
            return r.success ? 'refunded_duplicate' : 'refund_failed_duplicate';
        }

        if (orderStatus === 'pending_payment') {
            if (!Number.isFinite(paidPaise) || paidPaise !== expectedPaise) {
                logger.error(
                    `[PaymentRecovery] Amount mismatch on order ${order._id}: paid ${paidPaise} paise, expected ${expectedPaise}. Refunding.`,
                );
                await cancelPaidPendingOrderAndRefund(order._id, {
                    paymentId,
                    paidAmount: paidPaise / 100,
                    reason: 'amount_mismatch',
                    note: 'Amount paid did not match the order total',
                });
                return 'refunded_amount_mismatch';
            }
            try {
                await confirmPaidOnlineOrder(order, {
                    paymentId,
                    signature: null,
                    byRole: 'SYSTEM',
                    byId: null,
                    note: `Payment confirmed by Razorpay (${source})`,
                });
                logger.info(`[PaymentRecovery] Confirmed order ${order._id} from ${source}, payment ${paymentId}`);
                return 'confirmed';
            } catch (err) {
                logger.error(
                    `[PaymentRecovery] Confirming order ${order._id} failed (${err?.message || err}). Refunding payment ${paymentId}.`,
                );
                // Refunds only if the order is still pending_payment, i.e. it
                // really did not reach the restaurant.
                const res = await cancelPaidPendingOrderAndRefund(order._id, {
                    paymentId,
                    paidAmount: paidPaise / 100,
                    reason: 'order_confirmation_failed',
                    note: 'Payment received but the order could not be placed',
                });
                return res.cancelled ? 'refunded_confirmation_failed' : 'confirm_error_order_live';
            }
        }

        if (orderStatus.startsWith('cancelled')) {
            // A cancelled order whose own payment is still marked paid: its
            // cancellation refund failed. Retried via the ledger, not here.
            if (recordedPaymentId === paymentId) return 'cancelled_refund_tracked';
            const r = await refundRazorpayPaymentOnce({ ...refundBase, reason: 'order_cancelled' });
            return r.success ? 'refunded_cancelled_order' : 'refund_failed_cancelled_order';
        }

        // Order went ahead without this payment on record (unexpected). Leave
        // it for a person rather than refunding money for a live order.
        logger.warn(
            `[PaymentRecovery] Payment ${paymentId} captured for order ${order._id} in status ${orderStatus} / ${payStatus}, recorded payment ${recordedPaymentId || '-'}: left for manual review`,
        );
        return 'manual_review';
    });
}

const ORPHAN_MIN_AGE_SEC = 3 * 60;

/**
 * A captured payment whose Razorpay order matches no order of ours: the order
 * was deleted after the checkout was abandoned, and the payment landed later.
 *
 * Refunded only when the Razorpay order says it was created for a food/Mart
 * order (notes.kind = food_order, set at checkout). Wallet top-ups, rider
 * deposits, QR collections, and anything else on the same Razorpay account do
 * not carry it, and are never touched.
 */
async function settleOrphanPayment({ paymentId, rzOrderId, paidPaise, source }) {
    let rzOrder;
    try {
        rzOrder = await fetchRazorpayOrder(rzOrderId);
    } catch (err) {
        logger.warn(`[PaymentRecovery] Could not fetch Razorpay order ${rzOrderId}: ${err?.message || err}`);
        return 'orphan_lookup_failed';
    }
    const notes = rzOrder?.notes || {};
    if (String(notes.kind || '') !== 'food_order') return 'ignored_not_order_payment';

    // The order is saved right after its Razorpay order is created; give that a
    // moment, so a webhook racing order creation never refunds a live checkout.
    const ageSec = Date.now() / 1000 - Number(rzOrder?.created_at || 0);
    if (ageSec < ORPHAN_MIN_AGE_SEC) return 'orphan_too_new';

    const r = await refundRazorpayPaymentOnce({
        paymentId,
        amount: paidPaise / 100,
        reason: 'order_not_found',
        source,
        orderId: null,
        razorpayOrderId: rzOrderId,
        vertical: String(notes.vertical || ''),
    });
    logger.warn(
        `[PaymentRecovery] Payment ${paymentId} captured with no order (Razorpay order ${rzOrderId}, our order ${notes.order_id || '-'}): ${r.success ? 'refunded' : `refund failed: ${r.error}`}`,
    );
    return r.success ? 'refunded_orphan' : 'refund_failed_orphan';
}

// ---------------------------------------------------------------------------
// Reconciliation job: every 5 minutes, from the scheduler process.
// ---------------------------------------------------------------------------

// The app normally confirms within seconds of paying; a minute's grace is
// enough to stay out of its way before the server asks Razorpay itself.
const PENDING_MIN_AGE_MS = 60 * 1000;
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PAYMENT_SCAN_WINDOW_SEC = 3 * 60 * 60;
const PAYMENT_SCAN_DELAY_SEC = 2 * 60;

/** Payments already settled in this process, so each scan only asks Razorpay about new ones. */
const settledCache = new Map(); // paymentId -> at
const SETTLED_TTL_MS = 4 * 60 * 60 * 1000;
const FINAL_OUTCOMES = new Set([
    'already_settled', 'confirmed', 'refunded_duplicate', 'refunded_amount_mismatch',
    'refunded_confirmation_failed', 'refunded_cancelled_order', 'refunded_orphan',
    'cancelled_refund_tracked', 'ignored_not_order_payment', 'ignored_no_order_id', 'manual_review',
    'confirm_error_order_live',
]);

function rememberSettled(paymentId, outcome) {
    if (!FINAL_OUTCOMES.has(outcome)) return;
    settledCache.set(paymentId, Date.now());
    if (settledCache.size > 20000) settledCache.delete(settledCache.keys().next().value);
}

function isRecentlySettled(paymentId) {
    const at = settledCache.get(paymentId);
    if (!at) return false;
    if (Date.now() - at > SETTLED_TTL_MS) {
        settledCache.delete(paymentId);
        return false;
    }
    return true;
}

/** 1. Orders still waiting for payment: ask Razorpay whether they were paid. */
async function reconcilePendingOrders(stats) {
    const now = Date.now();
    const pending = await FoodOrder.find({
        orderStatus: 'pending_payment',
        'payment.method': 'razorpay',
        'payment.razorpay.orderId': { $nin: [null, ''] },
        createdAt: { $lte: new Date(now - PENDING_MIN_AGE_MS), $gte: new Date(now - PENDING_MAX_AGE_MS) },
    })
        .setOptions({ skipVerticalScope: true })
        .select('_id payment.razorpay.orderId')
        .limit(200)
        .lean();

    for (const doc of pending) {
        try {
            const attempts = await fetchRazorpayOrderPayments(doc.payment.razorpay.orderId);
            for (const p of attempts) {
                if (String(p?.status || '').toLowerCase() !== 'captured') continue;
                const outcome = await settleCapturedRazorpayPayment(p, { source: 'reconcile_pending' });
                stats[outcome] = (stats[outcome] || 0) + 1;
                rememberSettled(p.id, outcome);
            }
        } catch (err) {
            stats.errors += 1;
            logger.warn(`[Reconcile] pending order ${doc._id} check failed: ${err?.message || err}`);
        }
    }
    stats.pendingChecked = pending.length;
}

/** 2. Every captured payment of the last few hours: anything nobody recorded. */
async function reconcileRecentPayments(stats) {
    const nowSec = Math.floor(Date.now() / 1000);
    const payments = await listRazorpayPayments(nowSec - PAYMENT_SCAN_WINDOW_SEC, nowSec - PAYMENT_SCAN_DELAY_SEC);
    let checked = 0;
    for (const p of payments) {
        if (String(p?.status || '').toLowerCase() !== 'captured' || !p?.order_id) continue;
        if (isRecentlySettled(p.id)) continue;
        checked += 1;
        try {
            const outcome = await settleCapturedRazorpayPayment(p, { source: 'reconcile_scan' });
            stats[outcome] = (stats[outcome] || 0) + 1;
            rememberSettled(p.id, outcome);
        } catch (err) {
            stats.errors += 1;
            logger.warn(`[Reconcile] payment ${p.id} failed: ${err?.message || err}`);
        }
    }
    stats.paymentsScanned = payments.length;
    stats.paymentsChecked = checked;
}

/** 3. Refunds that failed or were interrupted: try again, and keep the order in step. */
async function retryFailedRefunds(stats) {
    const rows = await listRetryableRefunds(50);
    for (const row of rows) {
        try {
            const r = await refundRazorpayPaymentOnce({
                paymentId: row.paymentId,
                amount: row.amount,
                reason: row.reason,
                source: `retry_${row.source || ''}`,
                orderId: row.orderId,
                razorpayOrderId: row.razorpayOrderId,
                vertical: row.vertical,
            });
            if (row.orderId) await syncOrderRefund(row.orderId, row.paymentId, row.amount, r);
            stats[r.success ? 'refundRetried' : 'refundRetryFailed'] += 1;
            if (!r.success && (r.attempts || 0) >= MAX_REFUND_ATTEMPTS) {
                logger.error(
                    `[Reconcile] Refund for payment ${row.paymentId} (order ${row.orderId || '-'}) failed ${r.attempts} times: needs manual refund. Last error: ${r.error}`,
                );
            }
        } catch (err) {
            stats.errors += 1;
            logger.warn(`[Reconcile] refund retry ${row.paymentId} failed: ${err?.message || err}`);
        }
    }
}

/** Write a retried refund's result onto the order, if the payment is the order's own. */
async function syncOrderRefund(orderId, paymentId, amount, result) {
    const filter = { _id: orderId, 'payment.razorpay.paymentId': paymentId };
    if (result.success) {
        const sentToBank = String(result.status || '').toLowerCase() === 'processed';
        await FoodOrder.updateOne(
            { ...filter, 'payment.refund.status': { $ne: 'processed' } },
            {
                $set: {
                    'payment.status': 'refunded',
                    'payment.refund.status': sentToBank ? 'processed' : 'pending',
                    'payment.refund.amount': amount,
                    'payment.refund.refundId': result.refundId || '',
                    'payment.refund.processedAt': new Date(),
                },
            },
        ).setOptions({ skipVerticalScope: true });
    } else if (!result.inProgress) {
        await FoodOrder.updateOne(
            filter,
            { $set: { 'payment.refund.status': 'failed', 'payment.refund.amount': amount } },
        ).setOptions({ skipVerticalScope: true });
    }
}

/**
 * Cancelled online orders whose refund never started (the cancel happened
 * while Razorpay was unreachable before the ledger existed, for example).
 * Seven days back is plenty: every cancel path tries at once.
 */
async function refundCancelledPaidOrders(stats) {
    const docs = await FoodOrder.find({
        orderStatus: { $in: ['cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'] },
        'payment.method': 'razorpay',
        'payment.status': 'paid',
        'payment.razorpay.paymentId': { $nin: [null, ''] },
        updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), $lte: new Date(Date.now() - 2 * 60 * 1000) },
    })
        .setOptions({ skipVerticalScope: true })
        .select('_id vertical pricing payment')
        .limit(50)
        .lean();

    for (const doc of docs) {
        try {
            const r = await refundRazorpayPaymentOnce({
                paymentId: doc.payment.razorpay.paymentId,
                amount: Number(doc.payment?.refund?.amount) || Number(doc.pricing?.total) || 0,
                reason: 'order_cancelled',
                source: 'reconcile_cancelled',
                orderId: doc._id,
                razorpayOrderId: doc.payment.razorpay.orderId,
                vertical: doc.vertical,
            });
            await syncOrderRefund(doc._id, doc.payment.razorpay.paymentId, Number(doc.payment?.refund?.amount) || Number(doc.pricing?.total) || 0, r);
            stats[r.success ? 'cancelledRefunded' : 'cancelledRefundFailed'] += 1;
        } catch (err) {
            stats.errors += 1;
            logger.warn(`[Reconcile] cancelled order ${doc._id} refund failed: ${err?.message || err}`);
        }
    }
}

let running = false;

/**
 * Catch every payment the app and the webhook both missed: confirm the order,
 * or refund it. Safe to run any number of times, from any number of processes:
 * every action underneath is idempotent per order and per payment.
 */
export async function runPaymentReconciliation() {
    if (running) return { skipped: true };
    if (!isRazorpayConfigured()) return { skipped: true, reason: 'razorpay_not_configured' };
    running = true;
    const started = Date.now();
    const stats = {
        errors: 0, refundRetried: 0, refundRetryFailed: 0, cancelledRefunded: 0, cancelledRefundFailed: 0,
    };
    try {
        await reconcilePendingOrders(stats).catch((e) => { stats.errors += 1; logger.warn(`[Reconcile] pending: ${e?.message || e}`); });
        await reconcileRecentPayments(stats).catch((e) => { stats.errors += 1; logger.warn(`[Reconcile] scan: ${e?.message || e}`); });
        await retryFailedRefunds(stats).catch((e) => { stats.errors += 1; logger.warn(`[Reconcile] retries: ${e?.message || e}`); });
        await refundCancelledPaidOrders(stats).catch((e) => { stats.errors += 1; logger.warn(`[Reconcile] cancelled: ${e?.message || e}`); });
        // Last: delete checkouts abandoned over 30 minutes ago. It asks Razorpay
        // first and confirms any that turn out to be paid.
        await sweepStalePendingPaymentOrders().catch((e) => { stats.errors += 1; logger.warn(`[Reconcile] cleanup: ${e?.message || e}`); });
    } finally {
        running = false;
    }
    stats.ms = Date.now() - started;
    const acted = Object.entries(stats).filter(([k, v]) => v && !['ms', 'paymentsScanned', 'paymentsChecked', 'pendingChecked', 'already_settled', 'ignored_not_order_payment'].includes(k));
    if (acted.length) logger.info(`[Reconcile] ${JSON.stringify(stats)}`);
    return stats;
}

/**
 * Just step 1 of the above, cheap enough to run every minute: a paid order
 * whose confirmation never arrived (app closed straight after paying) reaches
 * the restaurant within about two minutes instead of up to seven.
 */
export async function runPendingPaymentCheck() {
    if (running) return { skipped: true };
    if (!isRazorpayConfigured()) return { skipped: true, reason: 'razorpay_not_configured' };
    running = true;
    const stats = { errors: 0 };
    try {
        await reconcilePendingOrders(stats);
    } finally {
        running = false;
    }
    if (stats.confirmed) logger.info(`[Reconcile] quick check confirmed ${stats.confirmed} paid order(s)`);
    return stats;
}

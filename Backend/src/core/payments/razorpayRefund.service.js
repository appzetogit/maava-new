import { RazorpayRefundLedger } from './models/razorpayRefundLedger.model.js';
import { initiateRazorpayRefund } from '../../modules/food/orders/helpers/razorpay.helper.js';
import { logger } from '../../utils/logger.js';

/** A claim older than this belongs to a worker that died mid-call, and may be taken over. */
const STALE_CLAIM_MS = 2 * 60 * 1000;
/** After this many failures the job stops retrying and leaves it to the team. */
export const MAX_REFUND_ATTEMPTS = 6;

/**
 * Refund a Razorpay payment exactly once, at speed "normal".
 *
 * Returns { success, refundId, status, alreadyRefunded, inProgress, error }.
 * - success + alreadyRefunded: refunded before; nothing new was sent.
 * - inProgress: another worker holds the claim right now. Treat it as "being refunded".
 * - success false: Razorpay refused or could not be reached. The ledger row is
 *   'failed' and the reconciliation job tries again.
 */
export async function refundRazorpayPaymentOnce({
    paymentId,
    amount,
    reason,
    source = '',
    orderId = null,
    razorpayOrderId = '',
    vertical = '',
}) {
    const pid = String(paymentId || '').trim();
    const rupees = Number(amount);
    if (!pid) return { success: false, error: 'missing_payment_id' };
    if (!Number.isFinite(rupees) || rupees <= 0) return { success: false, error: 'invalid_amount' };

    const now = new Date();
    let row;
    try {
        // Claim it: take over a failed row or one whose worker is gone, else create one.
        row = await RazorpayRefundLedger.findOneAndUpdate(
            {
                paymentId: pid,
                $or: [
                    { status: 'failed', attempts: { $lt: MAX_REFUND_ATTEMPTS } },
                    { status: 'processing', updatedAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
                ],
            },
            { $set: { status: 'processing', lastError: '' }, $inc: { attempts: 1 } },
            { new: true },
        );
        if (!row) {
            row = await RazorpayRefundLedger.create({
                paymentId: pid,
                razorpayOrderId: String(razorpayOrderId || ''),
                orderId: orderId || null,
                vertical: String(vertical || ''),
                amount: rupees,
                reason: String(reason || ''),
                source: String(source || ''),
                status: 'processing',
                attempts: 1,
            });
        }
    } catch (err) {
        if (err?.code !== 11000) throw err;
        // The row exists and was not claimable: refunded, in progress, or out of retries.
        const existing = await RazorpayRefundLedger.findOne({ paymentId: pid }).lean();
        if (existing?.status === 'initiated' || existing?.status === 'processed') {
            return {
                success: true,
                alreadyRefunded: true,
                refundId: existing.refundId,
                status: existing.refundStatus || existing.status,
            };
        }
        if (existing?.status === 'processing') return { success: false, inProgress: true, error: 'refund_in_progress' };
        return { success: false, error: existing?.lastError || 'refund_failed', attempts: existing?.attempts };
    }

    const result = await initiateRazorpayRefund(pid, rupees, {
        reason,
        receipt: orderId ? `rf_${String(orderId)}` : `rf_${pid}`,
        notes: {
            ...(orderId ? { order_id: String(orderId) } : {}),
            ...(source ? { source: String(source) } : {}),
        },
    });

    if (result.success) {
        const refundStatus = String(result.status || 'pending').toLowerCase();
        await RazorpayRefundLedger.updateOne(
            { _id: row._id },
            {
                $set: {
                    status: refundStatus === 'processed' ? 'processed' : 'initiated',
                    refundId: result.refundId || '',
                    refundStatus,
                    initiatedAt: row.initiatedAt || new Date(),
                    ...(refundStatus === 'processed' ? { processedAt: new Date() } : {}),
                },
            },
        );
        logger.info(
            `[Refund] ${result.alreadyRefunded ? 'Already refunded' : 'Initiated'} payment=${pid} order=${orderId || '-'} amount=${rupees} reason=${reason} refund=${result.refundId || '-'}`,
        );
        return {
            success: true,
            alreadyRefunded: Boolean(result.alreadyRefunded),
            refundId: result.refundId || '',
            status: refundStatus,
        };
    }

    await RazorpayRefundLedger.updateOne(
        { _id: row._id },
        { $set: { status: 'failed', lastError: String(result.error || 'refund_failed').slice(0, 500) } },
    );
    logger.error(`[Refund] FAILED payment=${pid} order=${orderId || '-'} attempt=${row.attempts} reason=${reason}: ${result.error}`);
    return { success: false, error: result.error, paymentStatus: result.paymentStatus, attempts: row.attempts };
}

/** From the refund.processed / refund.failed webhooks. */
export async function markLedgerRefundStatus(paymentId, { refundId, status }) {
    const s = String(status || '').toLowerCase();
    const set = { refundStatus: s };
    if (refundId) set.refundId = refundId;
    if (s === 'processed') {
        set.status = 'processed';
        set.processedAt = new Date();
    } else if (s === 'failed') {
        set.status = 'failed';
        set.lastError = 'Refund failed at the bank (refund.failed webhook)';
    }
    await RazorpayRefundLedger.updateOne({ paymentId: String(paymentId) }, { $set: set });
}

/** Ledger rows the reconciliation job should try again. */
export async function listRetryableRefunds(limit = 50) {
    const now = Date.now();
    return RazorpayRefundLedger.find({
        $or: [
            { status: 'failed', attempts: { $lt: MAX_REFUND_ATTEMPTS }, updatedAt: { $lt: new Date(now - 4 * 60 * 1000) } },
            { status: 'processing', updatedAt: { $lt: new Date(now - STALE_CLAIM_MS) } },
        ],
    })
        .sort({ updatedAt: 1 })
        .limit(limit)
        .lean();
}

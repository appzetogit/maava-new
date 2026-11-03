import { logger } from '../../../../utils/logger.js';
import { fetchRazorpayPayment, fetchRazorpayRefund } from '../helpers/razorpay.helper.js';

/**
 * Where a cancelled order's money is, for the customer's order screen.
 *
 * A refund to the original payment method passes three points: we start it,
 * Razorpay processes it and hands it to the bank (status "processed", with a
 * bank reference -- the ARN -- once the bank acknowledges it), and the bank
 * credits the customer. Nobody tells us about the last one, so it is shown as
 * an expected date, never ticked. A wallet refund is credited on the spot.
 *
 * Razorpay is asked live, at most every few minutes per refund, so a customer
 * who keeps reopening the order sees "Sent to your bank" appear without anyone
 * re-saving the order.
 */

const LOOKUP_TTL_MS = 5 * 60 * 1000;
const lookups = new Map(); // refundId -> { at, value }

// Bank credit after Razorpay processes a normal-speed refund, in working days.
const WORKING_DAYS_BY_METHOD = { upi: 3, wallet: 3, card: 7, netbanking: 7, emi: 7 };
const DEFAULT_WORKING_DAYS = 7;

const METHOD_LABELS = {
    upi: 'UPI account',
    card: 'card',
    netbanking: 'bank account',
    wallet: 'payment wallet',
    emi: 'card',
};

const addWorkingDays = (from, days) => {
    const date = new Date(from);
    let left = days;
    while (left > 0) {
        date.setDate(date.getDate() + 1);
        // Weekends in IST; bank holidays are not known here, so the estimate is a
        // floor the customer should allow a day or two beyond.
        const weekday = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDay();
        if (weekday !== 0 && weekday !== 6) left -= 1;
    }
    return date;
};

const formatDay = (date) =>
    new Date(date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Razorpay's view of the refund, cached. Null when it cannot be asked. */
async function lookUpRazorpayRefund(paymentId, refundId) {
    const cached = lookups.get(refundId);
    if (cached && Date.now() - cached.at < LOOKUP_TTL_MS) return cached.value;

    let value = null;
    try {
        const [refund, payment] = await Promise.all([
            fetchRazorpayRefund(refundId),
            paymentId ? fetchRazorpayPayment(paymentId).catch(() => null) : null,
        ]);
        value = {
            status: String(refund?.status || '').toLowerCase(), // pending | processed | failed
            arn: refund?.acquirer_data?.arn || refund?.acquirer_data?.rrn || null,
            processedAt: refund?.status === 'processed' && refund?.created_at
                ? new Date(Number(refund.created_at) * 1000)
                : null,
            method: String(payment?.method || '').toLowerCase() || null,
        };
    } catch (err) {
        logger.warn(`Refund lookup failed for ${refundId}: ${err?.message || err}`);
    }
    lookups.set(refundId, { at: Date.now(), value });
    if (lookups.size > 2000) lookups.delete(lookups.keys().next().value);
    return value;
}

export async function buildRefundProgress(order) {
    const payment = order?.payment || {};
    const refund = payment.refund || {};
    const stored = String(refund.status || 'none').toLowerCase();
    if (stored === 'none' && payment.status !== 'refunded') return null;

    const amount = Number(refund.amount) || Number(order?.pricing?.total) || 0;
    const startedAt = refund.processedAt || order?.updatedAt || null;
    const paymentMethod = String(payment.method || '').toLowerCase();

    if (paymentMethod === 'wallet') {
        return {
            state: 'credited',
            destination: 'wallet',
            amount,
            title: `${rupees(amount)} refunded to your Maava wallet`,
            message: 'It is in your wallet now, ready for your next order.',
            steps: [
                { key: 'started', label: 'Refund started', done: true, at: startedAt },
                { key: 'credited', label: 'Added to your Maava wallet', done: true, at: startedAt },
            ],
        };
    }

    if (stored === 'failed') {
        return {
            state: 'failed',
            destination: 'original',
            amount,
            title: `Your refund of ${rupees(amount)} needs attention`,
            message: 'The refund could not go through automatically. Our team will process it and contact you.',
            steps: [{ key: 'started', label: 'Refund started', done: true, at: startedAt }],
        };
    }

    const live = refund.refundId
        ? await lookUpRazorpayRefund(payment.razorpay?.paymentId, refund.refundId)
        : null;
    if (live?.status === 'failed') {
        return {
            state: 'failed',
            destination: 'original',
            amount,
            title: `Your refund of ${rupees(amount)} needs attention`,
            message: 'The bank did not accept the refund. Our team will process it again and contact you.',
            steps: [{ key: 'started', label: 'Refund started', done: true, at: startedAt }],
        };
    }

    const sentToBank = live ? live.status === 'processed' : stored === 'processed';
    const method = live?.method || null;
    const where = METHOD_LABELS[method] || 'original payment method';
    const workingDays = WORKING_DAYS_BY_METHOD[method] || DEFAULT_WORKING_DAYS;
    const sentAt = live?.processedAt || (sentToBank ? startedAt : null);
    const expectedBy = addWorkingDays(sentAt || startedAt || new Date(), workingDays);
    const overdue = Date.now() > expectedBy.getTime();
    const arn = live?.arn || null;

    let message;
    if (overdue) {
        message = `It should have reached your ${where} by ${formatDay(expectedBy)}. If it has not, `
            + (arn ? `share the bank reference ${arn} with your bank.` : 'contact support with your order ID.');
    } else {
        message = `Banks usually take ${workingDays === 3 ? '2-3' : '5-7'} working days. `
            + `Expected by ${formatDay(expectedBy)}.`;
    }

    return {
        state: sentToBank ? 'sent_to_bank' : 'started',
        destination: 'original',
        method,
        amount,
        title: `${rupees(amount)} refund on its way to your ${where}`,
        message,
        arn,
        expectedBy,
        steps: [
            { key: 'started', label: 'Refund started', done: true, at: startedAt },
            { key: 'sent_to_bank', label: 'Sent to your bank', done: sentToBank, at: sentAt },
            {
                key: 'credited',
                label: 'Back in your account',
                done: false,
                at: expectedBy,
                note: `Expected by ${formatDay(expectedBy)}`,
            },
        ],
    };
}

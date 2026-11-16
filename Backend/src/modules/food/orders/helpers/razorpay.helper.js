import crypto from 'crypto';

let Razorpay;
try {
    const mod = await import('razorpay');
    Razorpay = mod.default;
} catch {
    Razorpay = null;
}

import { config } from '../../../../config/env.js';

const KEY_ID = config.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '';

export function isRazorpayConfigured() {
    return Boolean(KEY_ID && KEY_SECRET && Razorpay);
}

export function getRazorpayKeyId() {
    return KEY_ID;
}

export function getRazorpayInstance() {
    if (!isRazorpayConfigured()) return null;
    return new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
}

export function createRazorpayOrder(amountPaise, currency = 'INR', receipt = '', notes = undefined) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return instance.orders.create({
        amount: Math.round(amountPaise),
        currency,
        receipt: receipt || undefined,
        ...(notes && Object.keys(notes).length ? { notes } : {})
    });
}

export function createPaymentLink({ amountPaise, currency = 'INR', description, orderId, customerName, customerEmail, customerPhone }) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return instance.paymentLink.create({
        amount: Math.round(amountPaise),
        currency,
        description: description || `Order ${orderId}`,
        customer: {
            name: customerName || 'Customer',
            email: customerEmail || 'customer@example.com',
            contact: customerPhone ? String(customerPhone).replace(/\D/g, '').slice(-10) : '9999999999'
        }
    });
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
    if (!KEY_SECRET) return false;
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', KEY_SECRET).update(body).digest('hex');
    return expected === signature;
}

/**
 * Fetch Razorpay payment (server-side) for additional validation (amount/status/order match).
 * @param {string} paymentId
 */
export async function fetchRazorpayPayment(paymentId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentId) throw new Error('paymentId is required');
    return instance.payments.fetch(String(paymentId));
}

/**
 * Every payment attempt made against a Razorpay order (failed ones included).
 * @param {string} razorpayOrderId
 * @returns {Promise<Array>} Razorpay payment entities
 */
export async function fetchRazorpayOrderPayments(razorpayOrderId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!razorpayOrderId) throw new Error('razorpayOrderId is required');
    const res = await instance.orders.fetchPayments(String(razorpayOrderId));
    return Array.isArray(res?.items) ? res.items : [];
}

/**
 * Fetch a Razorpay order (server-side): its amount, receipt and status.
 * @param {string} orderId
 */
export async function fetchRazorpayOrder(orderId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!orderId) throw new Error('orderId is required');
    return instance.orders.fetch(String(orderId));
}

/**
 * Fetch a refund: its status (pending / processed / failed) and, once the bank
 * acknowledges it, the reference in acquirer_data.arn.
 * @param {string} refundId
 */
export async function fetchRazorpayRefund(refundId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!refundId) throw new Error('refundId is required');
    return instance.refunds.fetch(String(refundId));
}

/**
 * Fetch Razorpay payment-link to check status (used for Razorpay QR auto verification).
 * @param {string} paymentLinkId
 */
export async function fetchRazorpayPaymentLink(paymentLinkId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentLinkId) throw new Error('paymentLinkId is required');
    return instance.paymentLink.fetch(String(paymentLinkId));
}

/**
 * Every refund already made against a payment.
 * @param {string} paymentId
 * @returns {Promise<Array>} Razorpay refund entities
 */
export async function fetchRazorpayPaymentRefunds(paymentId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentId) throw new Error('paymentId is required');
    const res = await instance.payments.fetchMultipleRefund(String(paymentId), { count: 100 });
    return Array.isArray(res?.items) ? res.items : [];
}

/**
 * Payments made on the account in a time window, all pages.
 * The reconciliation job uses it to find captured payments nothing recorded.
 * @param {number} fromSec unix seconds
 * @param {number} toSec unix seconds
 */
export async function listRazorpayPayments(fromSec, toSec, { maxPages = 20 } = {}) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    const out = [];
    const count = 100;
    for (let page = 0; page < maxPages; page += 1) {
        const res = await instance.payments.all({ from: fromSec, to: toSec, count, skip: page * count });
        const items = Array.isArray(res?.items) ? res.items : [];
        out.push(...items);
        if (items.length < count) break;
    }
    return out;
}

/**
 * Refund a captured payment through Razorpay, at normal speed (3-5 working days).
 *
 * Asks Razorpay first what has already been refunded on this payment. A refund
 * that went through but whose reply was lost (timeout, crash) would otherwise be
 * sent again, and Razorpay accepts a second refund while the payment still has
 * money on it. So an existing refund is returned instead of a new one made.
 *
 * Never throws: failures come back as { success: false, error }.
 *
 * @param {string} paymentId - Razorpay payment_id (captured)
 * @param {number} amount - Amount in rupees, e.g. 123.45
 * @param {{ reason?: string, receipt?: string, notes?: object }} [options]
 */
export async function initiateRazorpayRefund(paymentId, amount, options = {}) {
    if (!isRazorpayConfigured()) {
        return { success: false, error: 'Razorpay is not configured on this server', status: 'failed' };
    }
    const instance = getRazorpayInstance();
    const amountPaise = Math.round(Number(amount) * 100);
    try {
        const payment = await instance.payments.fetch(String(paymentId));
        const payStatus = String(payment?.status || '').toLowerCase();
        const refundedPaise = Number(payment?.amount_refunded) || 0;

        if (refundedPaise > 0 || payStatus === 'refunded') {
            const existing = await fetchRazorpayPaymentRefunds(paymentId).catch(() => []);
            const live = existing.find((r) => String(r?.status || '').toLowerCase() !== 'failed') || existing[0] || null;
            return {
                success: true,
                alreadyRefunded: true,
                refundId: live?.id || '',
                status: String(live?.status || 'processed').toLowerCase(),
                raw: live,
            };
        }
        if (payStatus !== 'captured') {
            // An authorized payment cannot be refunded: Razorpay gives it back to
            // the customer by itself if it is never captured. A failed one took no money.
            return { success: false, error: `payment_not_captured_${payStatus || 'unknown'}`, status: 'failed', paymentStatus: payStatus };
        }

        const refund = await instance.payments.refund(String(paymentId), {
            amount: Math.min(amountPaise, Number(payment.amount) || amountPaise),
            speed: 'normal',
            ...(options.receipt ? { receipt: String(options.receipt).slice(0, 40) } : {}),
            notes: {
                reason: String(options.reason || 'Order cancelled').slice(0, 250),
                at: new Date().toISOString(),
                ...(options.notes || {}),
            },
        });
        return {
            success: true,
            refundId: refund.id,
            status: String(refund.status || 'pending').toLowerCase(),
            raw: refund
        };
    } catch (err) {
        const message = err?.error?.description || err?.message || 'Razorpay refund API error';
        console.error(`Razorpay Refund API Failure [PaymentId: ${paymentId}]:`, message);
        return {
            success: false,
            error: message,
            status: 'failed'
        };
    }
}

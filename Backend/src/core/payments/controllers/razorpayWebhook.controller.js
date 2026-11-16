import crypto from 'crypto';
import { FoodOrder } from '../../../modules/food/orders/models/order.model.js';
import { settleCapturedRazorpayPayment } from '../../../modules/food/orders/services/order-payment-reconcile.service.js';
import { markLedgerRefundStatus } from '../razorpayRefund.service.js';
import { RazorpayWebhookEvent } from '../models/razorpayWebhookEvent.model.js';
import { config } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

/**
 * Razorpay webhook: the server-side source of truth for online payments.
 *
 * The app's verify-payment call is the fast path, but it depends on the phone
 * coming back from the UPI app with the network up. This does not. Subscribe in
 * the Razorpay dashboard to: order.paid, payment.captured, refund.processed,
 * refund.failed. URL: https://maava.in/api/v1/payments/webhook/razorpay
 *
 * Safe to receive any number of times. Repeat deliveries are skipped by event
 * id, and everything underneath is idempotent per order and per payment_id.
 */

function signatureMatches(rawBody, signature, secret) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(signature), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const handleRazorpayWebhook = async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const secret = config.razorpayWebhookSecret;

    if (!secret) {
        logger.error('Razorpay Webhook: RAZORPAY_WEBHOOK_SECRET is not set; rejecting.');
        return res.status(500).send('Webhook not configured');
    }
    if (!signature || !req.rawBody || !signatureMatches(req.rawBody, signature, secret)) {
        logger.warn('Razorpay Webhook: signature verification failed.');
        return res.status(400).send('Invalid signature');
    }

    // Parse the verified bytes, not req.body: the sanitizing middleware has
    // already been over req.body and may have changed it.
    let body;
    try {
        body = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
        return res.status(400).send('Invalid body');
    }
    const event = String(body?.event || '');
    const payload = body?.payload || {};
    const eventId = String(req.headers['x-razorpay-event-id'] || '').trim();
    const paymentEntity = payload.payment?.entity || null;
    const refundEntity = payload.refund?.entity || null;

    if (eventId) {
        const seen = await RazorpayWebhookEvent.exists({ eventId }).catch(() => null);
        if (seen) {
            logger.info(`Razorpay Webhook: duplicate ${event} ${eventId}, skipped`);
            return res.status(200).json({ status: 'ok', duplicate: true });
        }
    }

    logger.info(`Razorpay Webhook Received: ${event} ${eventId || ''} payment=${paymentEntity?.id || refundEntity?.payment_id || '-'}`);

    let outcome = 'ignored';
    try {
        if (event === 'payment.captured' || event === 'order.paid') {
            // order.paid carries the payment too. Either one settles the payment;
            // the second to arrive finds it done.
            if (paymentEntity) {
                outcome = await settleCapturedRazorpayPayment(paymentEntity, { source: `webhook_${event}` });
            }
        } else if (event === 'refund.processed' || event === 'refund.failed') {
            outcome = await handleRefundEvent(event, refundEntity);
        }
    } catch (err) {
        logger.error(`Razorpay Webhook ${event} failed: ${err?.message || err}`, { stack: err?.stack });
        // 500 makes Razorpay retry; the reconciliation job is the second net.
        return res.status(500).json({ message: 'Internal Server Error' });
    }

    if (eventId) {
        await RazorpayWebhookEvent.create({
            eventId,
            event,
            paymentId: String(paymentEntity?.id || refundEntity?.payment_id || ''),
            razorpayOrderId: String(paymentEntity?.order_id || ''),
            outcome: String(outcome || ''),
        }).catch(() => {});
    }
    logger.info(`Razorpay Webhook ${event}: ${outcome}`);
    return res.status(200).json({ status: 'ok' });
};

async function handleRefundEvent(event, refund) {
    if (!refund?.payment_id) return 'ignored_no_payment';
    const rzPaymentId = String(refund.payment_id);
    const processed = event === 'refund.processed';

    await markLedgerRefundStatus(rzPaymentId, { refundId: refund.id, status: processed ? 'processed' : 'failed' });

    const update = processed
        ? {
            $set: {
                'payment.status': 'refunded',
                'payment.refund.status': 'processed',
                'payment.refund.amount': Number(refund.amount) / 100,
                'payment.refund.refundId': refund.id,
            },
        }
        : { $set: { 'payment.refund.status': 'failed' } };

    const res = await FoodOrder.updateOne(
        {
            'payment.razorpay.paymentId': rzPaymentId,
            'payment.refund.status': { $ne: 'processed' },
        },
        update,
    ).setOptions({ skipVerticalScope: true });

    return res.modifiedCount ? `order_refund_${processed ? 'processed' : 'failed'}` : 'no_order_change';
}

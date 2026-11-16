import mongoose from 'mongoose';

/**
 * Razorpay webhook deliveries already handled, keyed by x-razorpay-event-id.
 *
 * Razorpay delivers at least once and retries anything that did not get a 2xx
 * in time, so one event can arrive several times. A row is written once an
 * event has been handled; a repeat is answered 200 without running again.
 * Kept 30 days, longer than Razorpay keeps retrying.
 */
const razorpayWebhookEventSchema = new mongoose.Schema(
    {
        eventId: { type: String, required: true, unique: true, trim: true },
        event: { type: String, default: '' },
        paymentId: { type: String, default: '' },
        razorpayOrderId: { type: String, default: '' },
        outcome: { type: String, default: '' },
        receivedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }
    },
    { collection: 'razorpay_webhook_events' }
);

export const RazorpayWebhookEvent = mongoose.model('RazorpayWebhookEvent', razorpayWebhookEventSchema);

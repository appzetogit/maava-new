import mongoose from 'mongoose';

/**
 * One row per Razorpay payment we have decided to refund.
 *
 * The unique paymentId is the idempotency key: a cancellation, the webhook, a
 * Razorpay retry of that webhook and the reconciliation job can all decide to
 * refund the same payment at the same moment, and only the one that claims this
 * row talks to Razorpay. Not vertical-scoped, so the webhook and the job (which
 * run outside any request) see food and Mart payments alike.
 */
const razorpayRefundLedgerSchema = new mongoose.Schema(
    {
        paymentId: { type: String, required: true, unique: true, trim: true },
        razorpayOrderId: { type: String, default: '', trim: true },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodOrder', default: null, index: true },
        vertical: { type: String, default: '' },
        amount: { type: Number, required: true, min: 0 },
        /** order_cancelled, order_not_found, amount_mismatch, duplicate_payment, order_confirmation_failed */
        reason: { type: String, default: '', trim: true },
        source: { type: String, default: '', trim: true },
        /**
         * processing: a worker is calling Razorpay now.
         * initiated: Razorpay accepted the refund. processed: Razorpay sent it to the bank.
         * failed: Razorpay refused or could not be reached; the job retries it.
         */
        status: {
            type: String,
            enum: ['processing', 'initiated', 'processed', 'failed'],
            default: 'processing',
            index: true
        },
        refundId: { type: String, default: '' },
        refundStatus: { type: String, default: '' },
        attempts: { type: Number, default: 0 },
        lastError: { type: String, default: '' },
        initiatedAt: { type: Date, default: null },
        processedAt: { type: Date, default: null }
    },
    { collection: 'razorpay_refund_ledger', timestamps: true }
);

razorpayRefundLedgerSchema.index({ status: 1, updatedAt: 1 });

export const RazorpayRefundLedger = mongoose.model('RazorpayRefundLedger', razorpayRefundLedgerSchema);

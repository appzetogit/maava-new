import mongoose from 'mongoose';

const foodDeliveryCashDepositSchema = new mongoose.Schema({
    deliveryPartnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FoodDeliveryPartner',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    /**
     * What the rider paid in FOR.
     *
     * 'cod_deposit' — handing over COD cash they collected, which clears
     * cash-in-hand. Capped at what they are actually holding.
     * 'wallet_topup' — their own money, added straight to the wallet balance
     * so they can clear the minimum-balance rule and keep taking orders.
     *
     * Same collection on purpose: both are "rider pays money in" through the
     * same Razorpay flow, and they differ only in which number they move.
     * Rows written before this field existed are COD deposits.
     */
    type: {
        type: String,
        enum: ['cod_deposit', 'wallet_topup'],
        default: 'cod_deposit',
        index: true
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'razorpay', 'upi', 'bank_transfer'],
        default: 'cash'
    },
    /**
     * 'Pending'             — Razorpay order created, payment not finished.
     * 'PendingVerification' — rider paid the company's UPI QR and filed a UTR
     *                         with a screenshot; nothing has moved yet, and an
     *                         admin has to check it against the bank account.
     *                         A static QR raises no webhook, so a human is the
     *                         only possible verification.
     * 'Completed'           — money confirmed. This is the ONLY status that
     *                         counts towards deposited cash (see
     *                         cashInHand.service.js), so approval is what
     *                         clears the rider's dues.
     * 'Rejected'            — admin refused the claim, with a reason.
     * 'Failed'              — payment attempt failed at the gateway.
     */
    status: {
        type: String,
        enum: ['Pending', 'PendingVerification', 'Completed', 'Rejected', 'Failed'],
        default: 'Pending',
        index: true
    },
    /**
     * Bank reference for the UPI transfer, as typed by the rider. Unique so
     * one transfer cannot be claimed twice -- sparse because every Razorpay
     * row has none. Uppercased on the way in; 12 alphanumerics.
     */
    utr: {
        type: String,
        trim: true,
        uppercase: true,
        default: null
    },
    /** Screenshot of the payment. Kept after approval: it is the evidence. */
    proofImageUrl: {
        type: String,
        default: ''
    },
    submittedAt: Date,
    reviewedAt: Date,
    /** Why the admin refused, shown to the rider so they can fix and resend. */
    rejectionReason: {
        type: String,
        trim: true,
        default: ''
    },
    razorpayOrderId: {
        type: String,
        default: ''
    },
    razorpayPaymentId: String,
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    adminNote: String
}, { 
    collection: 'food_delivery_cash_deposits', 
    timestamps: true 
});

foodDeliveryCashDepositSchema.index({ createdAt: -1 });
// One UTR, one settlement. Partial rather than plain sparse: every gateway row
// carries null, and a plain unique index would collide on the second one.
foodDeliveryCashDepositSchema.index(
    { utr: 1 },
    { unique: true, partialFilterExpression: { utr: { $type: 'string' } } }
);

export const FoodDeliveryCashDeposit = mongoose.model('FoodDeliveryCashDeposit', foodDeliveryCashDepositSchema);

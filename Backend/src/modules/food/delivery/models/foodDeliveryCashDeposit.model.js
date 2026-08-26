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
    status: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed'],
        default: 'Pending',
        index: true
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

export const FoodDeliveryCashDeposit = mongoose.model('FoodDeliveryCashDeposit', foodDeliveryCashDepositSchema);

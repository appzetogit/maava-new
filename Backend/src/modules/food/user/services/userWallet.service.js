import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodUserWallet } from '../models/userWallet.model.js';
import { getWalletTopupLimits } from './walletSettings.service.js';
import { createRazorpayOrder, fetchRazorpayOrder, fetchRazorpayPayment, getRazorpayKeyId, isRazorpayConfigured, verifyPaymentSignature } from '../../orders/helpers/razorpay.helper.js';

const ensureWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const existing = await FoodUserWallet.findOne({ userId: oid });
    if (existing) return existing;
    return FoodUserWallet.create({ userId: oid, balance: 0, transactions: [] });
};

export const creditReferralReward = async (userId, amountInr, metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }
    const wallet = await ensureWallet(userId);
    wallet.transactions.unshift({
        type: 'addition',
        amount,
        status: 'Completed',
        description: 'Referral reward',
        metadata: { source: 'referral_reward', ...(metadata || {}) }
    });
    wallet.balance = Number(wallet.balance || 0) + amount;
    wallet.referralEarnings = Number(wallet.referralEarnings || 0) + amount;
    await wallet.save();
    return { wallet: await getUserWallet(userId) };
};

export const getUserWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const [wallet, limits] = await Promise.all([
        FoodUserWallet.findOne({ userId: oid }),
        getWalletTopupLimits()
    ]);
    // The apps read the add-money limits from here instead of hard-coding them.
    const topupLimits = { min: limits.minTopup, max: limits.maxTopup };
    if (!wallet) {
        return { balance: 0, referralEarnings: 0, topupLimits, transactions: [] };
    }
    // Return newest first (UI expects recent transactions on top)
    const tx = Array.isArray(wallet.transactions) ? [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
    return {
        balance: Number(wallet.balance) || 0,
        topupLimits,
        referralEarnings: Number(wallet.referralEarnings) || 0,
        transactions: tx.map((t) => ({
            id: String(t._id),
            _id: t._id,
            type: t.type,
            amount: Number(t.amount) || 0,
            status: t.status || 'Completed',
            description: t.description || '',
            date: t.createdAt,
            createdAt: t.createdAt,
            metadata: t.metadata || {}
        }))
    };
};

// Enforced here, not only in the apps: the website allowed 1, and users were
// topping up 1 at a time from many different UPI IDs. Limits come from the
// admin's Customer Wallet Settings. Verify only credits orders created here,
// so this is the one gate every top-up passes.
export const createWalletTopupOrder = async (userId, amountInr) => {
    const { minTopup, maxTopup } = await getWalletTopupLimits();
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount < minTopup) {
        throw new ValidationError(`Minimum amount is ₹${minTopup.toLocaleString('en-IN')}`);
    }
    if (amount > maxTopup) {
        throw new ValidationError(`Maximum amount is ₹${maxTopup.toLocaleString('en-IN')}`);
    }

    const amountPaise = Math.round(amount * 100);

    if (!isRazorpayConfigured()) {
        // Dev fallback: return a compatible shape without writing to DB.
        const orderId = `order_dev_${Date.now()}`;
        return {
            razorpay: {
                key: getRazorpayKeyId() || 'rzp_test_dummy',
                orderId,
                amount: amountPaise,
                currency: 'INR'
            }
        };
    }

    const receipt = `wallet_topup_${String(userId).slice(-8)}_${Date.now()}`;
    const order = await createRazorpayOrder(amountPaise, 'INR', receipt);

    return {
        razorpay: {
            key: getRazorpayKeyId(),
            orderId: String(order.id),
            amount: Number(order.amount) || amountPaise,
            currency: order.currency || 'INR'
        }
    };
};

export const verifyWalletTopupPayment = async (userId, payload) => {
    const orderId = String(payload?.razorpayOrderId || '').trim();
    const paymentId = String(payload?.razorpayPaymentId || '').trim();
    const signature = String(payload?.razorpaySignature || '').trim();

    if (!orderId) throw new ValidationError('razorpayOrderId is required');
    if (!paymentId) throw new ValidationError('razorpayPaymentId is required');
    if (!signature) throw new ValidationError('razorpaySignature is required');

    const wallet = await ensureWallet(userId);
    const existing = wallet.transactions.find((t) => String(t.razorpayOrderId || '') === orderId);
    if (existing && String(existing.status).toLowerCase() === 'completed') {
        return { wallet: await getUserWallet(userId) };
    }

    // The amount is never taken from the client: the signature only covers
    // orderId|paymentId, so a client-sent amount could be anything (pay 1, claim 100).
    let amount;
    if (isRazorpayConfigured()) {
        if (!verifyPaymentSignature(orderId, paymentId, signature)) {
            throw new ValidationError('Payment verification failed');
        }
        const [order, payment] = await Promise.all([
            fetchRazorpayOrder(orderId),
            fetchRazorpayPayment(paymentId)
        ]);
        const receiptPrefix = `wallet_topup_${String(userId).slice(-8)}_`;
        if (!String(order?.receipt || '').startsWith(receiptPrefix)) {
            throw new ValidationError('Payment verification failed');
        }
        if (String(payment?.order_id || '') !== orderId) {
            throw new ValidationError('Payment verification failed');
        }
        if (!['captured', 'authorized'].includes(String(payment?.status || '').toLowerCase())) {
            throw new ValidationError('Payment not completed');
        }
        amount = Math.min(Number(payment.amount) || 0, Number(order.amount) || 0) / 100;
    } else {
        // Dev fallback only (no Razorpay keys): accept the client amount.
        amount = Number(payload?.amount);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Payment verification failed');
    }

    // Store ONLY after payment is verified. Atomic so two concurrent verify
    // calls for the same order cannot both credit the wallet.
    // A null result means a concurrent request already credited it; either way return the wallet.
    await FoodUserWallet.findOneAndUpdate(
        { _id: wallet._id, 'transactions.razorpayOrderId': { $ne: orderId } },
        {
            $push: {
                transactions: {
                    $each: [{
                        type: 'addition',
                        amount,
                        status: 'Completed',
                        description: isRazorpayConfigured() ? 'Wallet top-up' : 'Wallet top-up (dev)',
                        metadata: { source: 'wallet_topup', mode: isRazorpayConfigured() ? 'razorpay' : 'dev' },
                        razorpayOrderId: orderId,
                        razorpayPaymentId: paymentId,
                        razorpaySignature: signature
                    }],
                    $position: 0
                }
            },
            $inc: { balance: amount }
        },
        { new: true }
    );

    return { wallet: await getUserWallet(userId) };
};

export const deductWalletBalance = async (userId, amountInr, description = 'Order payment', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Invalid deduction amount');
    }

    const wallet = await ensureWallet(userId);
    if (wallet.balance < amount) {
        throw new ValidationError('Insufficient wallet balance');
    }

    wallet.transactions.unshift({
        type: 'deduction',
        amount,
        status: 'Completed',
        description,
        metadata: { source: 'order_payment', ...(metadata || {}) }
    });

    wallet.balance = Number(wallet.balance) - amount;
    await wallet.save();

    return { wallet: await getUserWallet(userId) };
};

export const refundWalletBalance = async (userId, amountInr, description = 'Order refund', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }

    const wallet = await ensureWallet(userId);
    wallet.transactions.unshift({
        type: 'refund',
        amount,
        status: 'Completed',
        description,
        metadata: { source: 'order_refund', ...(metadata || {}) }
    });

    wallet.balance = Number(wallet.balance) + amount;
    await wallet.save();

    return { wallet: await getUserWallet(userId) };
};


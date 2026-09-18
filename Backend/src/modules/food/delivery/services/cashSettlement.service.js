import mongoose from 'mongoose';

import { NotFoundError, ValidationError } from '../../../../core/auth/errors.js';
import { notifyAdminsSafely, sendNotificationToOwner } from '../../../../core/notifications/firebase.service.js';
import { logger } from '../../../../utils/logger.js';
import { saveImageBuffer } from '../../../../services/storage.service.js';
import { FoodDeliveryCashDeposit } from '../models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { getDeliveryPartnerWalletEnhanced } from './deliveryFinance.service.js';

/**
 * What the rider still owes the company.
 *
 * Read through the wallet rather than cashInHand.service: production resolves
 * this figure in deliveryFinance, and that is the number the rider already
 * sees on their own wallet screen. Two sources for one balance is how a rider
 * gets told they owe one amount and charged another.
 */
const readCashInHand = async (deliveryPartnerId) => {
    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    return Number(wallet?.cashInHand) || 0;
};

/** A UTR is 12 alphanumerics. Rejecting the typo here saves an admin the trip. */
const UTR_PATTERN = /^[A-Z0-9]{12}$/;

const normalizeUtr = (value) => String(value || '').trim().toUpperCase();

/**
 * A rider's claim that they paid their COD dues into the company's UPI.
 *
 * Deliberately does NOT touch the balance: only 'Completed' rows count as
 * deposited cash, and nothing here writes that. The rider owes exactly what
 * they owed before until an admin approves.
 */
export const submitCashSettlement = async (deliveryPartnerId, payload = {}, file = null) => {
    const utr = normalizeUtr(payload.utr);
    if (!UTR_PATTERN.test(utr)) {
        throw new ValidationError('Enter the 12-character UTR from your payment app');
    }

    if (!file?.buffer?.length) {
        throw new ValidationError('Attach a screenshot of the payment');
    }

    const cashInHand = await readCashInHand(deliveryPartnerId);
    if (cashInHand <= 0) {
        throw new ValidationError('You have no pending cash to settle');
    }

    // Blank means "all of it", which is what the app prefills.
    const requested = payload.amount === undefined || payload.amount === null || payload.amount === ''
        ? cashInHand
        : Number(payload.amount);
    if (!Number.isFinite(requested) || requested < 1) {
        throw new ValidationError('Enter the amount you paid');
    }
    if (requested > cashInHand) {
        throw new ValidationError('Amount cannot be more than your pending cash');
    }

    // Checked before the upload so a duplicate costs nothing; the unique index
    // is what actually guarantees it under two simultaneous submits.
    const existing = await FoodDeliveryCashDeposit.findOne({ utr }).select('_id').lean();
    if (existing) {
        throw new ValidationError('This UTR has already been submitted');
    }

    // Saved with the screenshot's real type: phones send PNG as often as JPEG,
    // and the generic helper labels everything image/jpeg, which makes the
    // allowed-type check meaningless and can mangle the file.
    const saved = await saveImageBuffer(file.buffer, 'food/delivery/cash-settlements', {
        mimeType: file.mimetype,
        originalname: file.originalname
    });
    const proofImageUrl = saved.url;

    let settlement;
    try {
        settlement = await FoodDeliveryCashDeposit.create({
            deliveryPartnerId,
            amount: Math.round(requested * 100) / 100,
            type: 'cod_deposit',
            paymentMethod: 'upi',
            status: 'PendingVerification',
            utr,
            proofImageUrl,
            submittedAt: new Date()
        });
    } catch (error) {
        // The index caught a race the lookup above could not.
        if (error?.code === 11000) throw new ValidationError('This UTR has already been submitted');
        throw error;
    }

    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).select('name phone').lean();
    await notifyAdminsSafely({
        title: 'Cash settlement to verify',
        body: `${partner?.name || 'A rider'} paid ₹${settlement.amount} · UTR ${utr}`,
        data: { type: 'cash_settlement', settlementId: String(settlement._id) }
    });

    return {
        settlement: serializeForRider(settlement.toObject()),
        cashInHand
    };
};

/** The rider's own settlement history, newest first. */
export const listCashSettlementsForPartner = async (deliveryPartnerId, query = {}) => {
    const limit = Math.min(parseInt(query.limit, 10) || 20, 100);
    const rows = await FoodDeliveryCashDeposit.find({
        deliveryPartnerId,
        status: { $in: ['PendingVerification', 'Completed', 'Rejected'] },
        utr: { $type: 'string' }
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

    return {
        settlements: rows.map(serializeForRider),
        cashInHand: await readCashInHand(deliveryPartnerId)
    };
};

/**
 * Approve or reject one claim.
 *
 * Approval marks the row 'Completed', which is what cashInHand.service counts
 * as deposited -- so the rider's dues drop by the approved amount rather than
 * being force-written to zero. Cash they collected while waiting for approval
 * stays owed, which is the whole point of deriving the number.
 *
 * [approvedAmount] lets the admin correct what the rider typed; they are
 * reading the real figure off the bank statement.
 */
export const reviewCashSettlement = async (settlementId, { action, approvedAmount, reason, adminId } = {}) => {
    if (!mongoose.Types.ObjectId.isValid(String(settlementId))) {
        throw new ValidationError('Invalid settlement id');
    }

    const settlement = await FoodDeliveryCashDeposit.findById(settlementId);
    if (!settlement) throw new NotFoundError('Settlement not found');
    if (settlement.status !== 'PendingVerification') {
        throw new ValidationError(`This settlement is already ${settlement.status}`);
    }

    if (action === 'approve') {
        const amount = approvedAmount === undefined || approvedAmount === null || approvedAmount === ''
            ? Number(settlement.amount)
            : Number(approvedAmount);
        if (!Number.isFinite(amount) || amount < 1) {
            throw new ValidationError('Approved amount must be at least ₹1');
        }

        // Never clear more than the rider holds: an over-approval would hide
        // the next COD deliveries behind a figure stuck at 0.
        const holding = await readCashInHand(settlement.deliveryPartnerId);
        if (amount > holding + 0.001) {
            throw new ValidationError(`The rider only holds ₹${holding}. Approve ₹${holding} or less.`);
        }
        settlement.amount = Math.round(amount * 100) / 100;
        settlement.status = 'Completed';
        settlement.adminId = adminId || null;
        settlement.reviewedAt = new Date();
        await settlement.save();

        const cashInHand = await readCashInHand(settlement.deliveryPartnerId);
        await notifyPartnerSafely(settlement.deliveryPartnerId, {
            title: 'Cash settlement approved',
            body: cashInHand > 0
                ? `₹${settlement.amount} cleared. Pending cash is now ₹${cashInHand}.`
                : `₹${settlement.amount} cleared. You have no pending cash.`,
            data: { type: 'cash_settlement_approved', settlementId: String(settlement._id) }
        });

        return { settlement: serializeForRider(settlement.toObject()), cashInHand };
    }

    if (action === 'reject') {
        const note = String(reason || '').trim();
        if (!note) throw new ValidationError('Give a reason so the rider can fix it');

        settlement.status = 'Rejected';
        settlement.rejectionReason = note;
        settlement.adminId = adminId || null;
        settlement.reviewedAt = new Date();
        await settlement.save();

        await notifyPartnerSafely(settlement.deliveryPartnerId, {
            title: 'Cash settlement rejected',
            body: note,
            data: { type: 'cash_settlement_rejected', settlementId: String(settlement._id) }
        });

        return {
            settlement: serializeForRider(settlement.toObject()),
            cashInHand: await readCashInHand(settlement.deliveryPartnerId)
        };
    }

    throw new ValidationError("Action must be 'approve' or 'reject'");
};

/** A failed push must never fail the review the admin just made. */
const notifyPartnerSafely = async (deliveryPartnerId, payload) => {
    try {
        await sendNotificationToOwner({
            ownerType: 'DELIVERY_PARTNER',
            ownerId: String(deliveryPartnerId),
            payload
        });
    } catch (error) {
        logger.error(`Cash settlement push failed: ${error.message}`);
    }
};

function serializeForRider(doc) {
    return {
        id: String(doc._id),
        amount: Number(doc.amount || 0),
        utr: doc.utr || '',
        proofImageUrl: doc.proofImageUrl || '',
        status: doc.status,
        rejectionReason: doc.rejectionReason || '',
        submittedAt: doc.submittedAt || doc.createdAt,
        reviewedAt: doc.reviewedAt || null
    };
}

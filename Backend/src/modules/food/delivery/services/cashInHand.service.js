import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodDeliveryCashDeposit } from '../models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryWallet } from '../models/deliveryWallet.model.js';
import { FoodDeliveryCashLimit } from '../../admin/models/deliveryCashLimit.model.js';

/**
 * How much COD cash a rider is physically carrying.
 *
 * There were two answers to this in the codebase and the wrong one guarded the
 * money. `FoodDeliveryWallet.cashInHand` is a ledger field that nothing
 * increments on delivery -- deliberately, because nothing decrements it on
 * deposit either, so incrementing would latch a rider out permanently. The
 * result was that both cash-limit enforcement points compared a permanently
 * zero number against the limit and never fired: riders were carrying several
 * times the configured limit and still being offered cash orders.
 *
 * The figure riders are actually shown is derived -- delivered COD minus
 * completed deposits -- and that is the one that is correct. This module is
 * that calculation, in one place, so enforcement and display cannot drift
 * apart again.
 */

/**
 * The arithmetic, separated from the queries.
 *
 * Exported so deliveryFinance.service.js can reuse it with aggregation results
 * it has already fetched, rather than paying for the same reads twice.
 *
 * Floored at zero: a rider who over-deposits (or whose deposits were recorded
 * before their orders) must read as holding nothing, never as negative, which
 * would otherwise hand them extra headroom against the limit.
 */
export const computeCashInHand = (grossCashCollected, totalDepositedCash) =>
    Math.max(0, (Number(grossCashCollected) || 0) - (Number(totalDepositedCash) || 0));

/**
 * Cash currently held by each of [partnerIds].
 *
 * Batched rather than per-rider: the dispatcher asks about every online rider
 * on each hunt, and one aggregation over the whole set keeps that a fixed two
 * queries instead of two per rider.
 *
 * Counts `pricing.total` -- the whole order value, which is what the rider
 * actually took from the customer. Not `riderEarning`, which is only their cut
 * and understates what is in their pocket by a long way.
 *
 * Only `payment.method: 'cash'` counts. A razorpay_qr order is paid to the
 * company directly, so it constrains nothing physically; it is still refused at
 * accept time by the caller when the rider is already over, because the point
 * of the block is to make them deposit.
 *
 * @returns {Promise<Map<string, number>>} partner id -> cash in hand
 */
export const getCashInHandFor = async (partnerIds = []) => {
    const ids = (partnerIds || [])
        .filter(Boolean)
        .map((id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id))));
    if (ids.length === 0) return new Map();

    const [collected, deposited, wallets] = await Promise.all([
        FoodOrder.aggregate([
            {
                $match: {
                    'dispatch.deliveryPartnerId': { $in: ids },
                    orderStatus: 'delivered',
                    'payment.method': 'cash',
                },
            },
            {
                $group: {
                    _id: '$dispatch.deliveryPartnerId',
                    total: { $sum: { $ifNull: ['$pricing.total', 0] } },
                },
            },
        ]),
        FoodDeliveryCashDeposit.aggregate([
            {
                $match: {
                    deliveryPartnerId: { $in: ids },
                    status: 'Completed',
                    // Rows written before `type` existed are COD deposits.
                    // A wallet_topup is the rider's own money and must not
                    // reduce what they owe the company.
                    $or: [{ type: 'cod_deposit' }, { type: { $exists: false } }, { type: null }],
                },
            },
            { $group: { _id: '$deliveryPartnerId', total: { $sum: { $ifNull: ['$amount', 0] } } } },
        ]),
        // The ledger field. Normally zero and normally ignored, but an admin
        // can set it by hand to correct a rider's float, and deliveryFinance
        // already shows max(derived, ledger). Enforcement takes the same max so
        // the number that blocks a rider is exactly the number they were shown
        // -- a manual correction that appeared on their screen but did not
        // actually restrict them would be worse than not offering the control.
        FoodDeliveryWallet.find({ deliveryPartnerId: { $in: ids } })
            .select('deliveryPartnerId cashInHand')
            .lean(),
    ]);

    const depositedBy = new Map(deposited.map((r) => [String(r._id), Number(r.total) || 0]));
    const result = new Map();
    for (const id of ids) {
        const key = String(id);
        result.set(key, 0);
    }
    for (const row of collected) {
        const key = String(row._id);
        result.set(key, computeCashInHand(row.total, depositedBy.get(key) || 0));
    }
    for (const w of wallets) {
        const key = String(w.deliveryPartnerId);
        const ledger = Number(w.cashInHand) || 0;
        if (ledger > (result.get(key) || 0)) result.set(key, ledger);
    }
    // A rider with deposits but no collections still reads as zero, which the
    // initialisation above already gives.
    return result;
};

/** Cash held by one rider. */
export const getCashInHandForPartner = async (partnerId) => {
    const map = await getCashInHandFor([partnerId]);
    return map.get(String(partnerId)) || 0;
};

/**
 * The configured ceiling, or 0 meaning "no limit".
 *
 * Zero is the schema default, so an install that never configured this must not
 * find every rider silently blocked.
 */
export const getCashLimit = async () => {
    const settings = await FoodDeliveryCashLimit.findOne({ isActive: true })
        .select('deliveryCashLimit')
        .lean();
    return Math.max(0, Number(settings?.deliveryCashLimit) || 0);
};

/** Whether [cashInHand] has reached [limit]. A limit of 0 never blocks. */
export const isOverCashLimit = (cashInHand, limit) =>
    Number(limit) > 0 && Number(cashInHand) >= Number(limit);

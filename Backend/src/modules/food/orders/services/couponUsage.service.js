import mongoose from 'mongoose';

import { logger } from '../../../../utils/logger.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { FoodOrder } from '../models/order.model.js';

const asObjectId = (value) => {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) return value;
    return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
};

/**
 * Marks an order as having spent a redemption of [offerId]. Returns false when
 * it already had, so the caller counts the use only once.
 *
 * Collection-level, by _id: both models are scoped to a vertical, and the
 * payment webhook that records an online order's coupon has none in scope.
 */
export async function claimCouponUsageRecord(orderId, offerId) {
    const _id = asObjectId(orderId);
    if (!_id) return false;
    const res = await FoodOrder.collection.updateOne(
        { _id, couponUsageRecordedAt: null },
        { $set: { couponUsageRecordedAt: new Date(), couponOfferId: asObjectId(offerId) } }
    );
    return res.modifiedCount === 1;
}

/**
 * Gives a cancelled order's coupon use back to the customer and the offer.
 *
 * Safe to call from anywhere an order dies, including paths that never
 * recorded a use (an abandoned online payment): with nothing recorded there is
 * nothing to claim. Never throws -- a failure here must not fail the
 * cancellation itself.
 */
export async function releaseCouponUsageForOrder(orderLike) {
    const _id = asObjectId(orderLike?._id);
    if (!_id) return false;
    try {
        const claimed = await FoodOrder.collection.findOneAndUpdate(
            { _id, couponUsageRecordedAt: { $ne: null }, couponUsageReleasedAt: null },
            { $set: { couponUsageReleasedAt: new Date() } },
            { returnDocument: 'after', projection: { userId: 1, couponOfferId: 1 } }
        );
        // Driver versions differ on whether the document or a wrapper comes back.
        const order = claimed && Object.prototype.hasOwnProperty.call(claimed, 'value') ? claimed.value : claimed;
        if (!order?.couponOfferId) return false;

        // Floored at zero: a count that was never incremented must not go negative.
        await FoodOffer.collection.updateOne(
            { _id: order.couponOfferId, usedCount: { $gt: 0 } },
            { $inc: { usedCount: -1 } }
        );
        if (order.userId) {
            await FoodOfferUsage.collection.updateOne(
                { offerId: order.couponOfferId, userId: asObjectId(order.userId), count: { $gt: 0 } },
                { $inc: { count: -1 } }
            );
        }
        return true;
    } catch (err) {
        logger.error(`Coupon release failed for order ${String(_id)}: ${err.message}`);
        return false;
    }
}

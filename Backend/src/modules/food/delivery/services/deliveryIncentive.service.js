import mongoose from 'mongoose';
import { FoodEarningAddon } from '../../admin/models/earningAddon.model.js';
import { FoodEarningAddonHistory } from '../../admin/models/earningAddonHistory.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { logger } from '../../../../utils/logger.js';
import { config } from '../../../../config/env.js';

/**
 * Delivery incentives: "complete 5 deliveries in this window, earn Rs.100".
 *
 * The offers, the admin CRUD and the rider-facing list already existed. What did
 * not was anything that awards them. `checkEarningAddonCompletions` was reachable
 * from exactly one admin route, so a rider hit the target and nothing happened
 * until somebody remembered to press a button -- and then a second button to
 * release the money. This module is the missing half, and the admin scan now
 * delegates here so there is one award path rather than two that drift.
 *
 * Modelled on deliveryReferral.service.js, which solves the same problem
 * (pay-once-per-event, fired from a delivery completion): write the ledger row
 * first and let a unique index arbitrate, never throw into the caller, and hang
 * off completeDelivery as a fire-and-forget hook.
 */

/** MongoDB duplicate key. The unique index on history is doing the locking. */
const DUPLICATE_KEY = 11000;

/**
 * Riders are shared across verticals, so rider-facing requests run under the
 * CROSS_VERTICAL ambient scope and the scoping plugin deliberately stops
 * filtering. Every query and every insert below therefore names its vertical
 * explicitly -- inherited scope here would either read both verticals' offers
 * at once or stamp new rows with the process default, and a food delivery would
 * start paying out grocery incentives.
 */
const resolveVertical = (vertical) => {
    const v = String(vertical || '').trim().toLowerCase();
    return v && v !== 'all' ? v : String(config.defaultVertical || 'food');
};

/**
 * Deliveries this rider completed inside the offer window.
 *
 * Counts on when the order was DELIVERED, not when it was placed. The previous
 * implementation matched `createdAt` against the offer dates, which asks a
 * different question than the offer does: an order placed at 23:55 and handed
 * over at 00:10 counted towards the day it was ordered, so riders working
 * across a window boundary were paid for the wrong window.
 *
 * Orders predating `deliveryState.deliveredAt` fall back to `createdAt` so the
 * first evaluation after deploy does not read a rider's history as empty.
 */
const countDeliveriesInWindow = async ({ partnerId, vertical, startDate, endDate }) =>
    FoodOrder.countDocuments({
        vertical,
        'dispatch.deliveryPartnerId': partnerId,
        orderStatus: 'delivered',
        $or: [
            { 'deliveryState.deliveredAt': { $gte: startDate, $lte: endDate } },
            {
                'deliveryState.deliveredAt': { $exists: false },
                createdAt: { $gte: startDate, $lte: endDate }
            }
        ]
    });

/**
 * Take one redemption off the offer's cap, atomically.
 *
 * `maxRedemptions` was enforced only where offers are LISTED to riders, never
 * where they are awarded, so a cap of 100 would quietly pay everyone who
 * qualified. The condition and the increment have to be one operation: read it
 * first and two riders qualifying together both see 99.
 *
 * Returns false when the cap is exhausted, in which case no slot was taken.
 */
const reserveRedemption = async (offerId, vertical) => {
    const updated = await FoodEarningAddon.findOneAndUpdate(
        {
            _id: offerId,
            vertical,
            $or: [
                { maxRedemptions: null },
                { maxRedemptions: { $exists: false } },
                { $expr: { $lt: ['$currentRedemptions', '$maxRedemptions'] } }
            ]
        },
        { $inc: { currentRedemptions: 1 } },
        { new: true }
    ).lean();
    return Boolean(updated);
};

const releaseRedemption = async (offerId, vertical) => {
    await FoodEarningAddon.updateOne(
        { _id: offerId, vertical, currentRedemptions: { $gt: 0 } },
        { $inc: { currentRedemptions: -1 } }
    ).catch(() => {});
};

/**
 * How many awards this offer owes the rider in total, given their delivery count.
 *
 * A one-shot offer tops out at a single award however many deliveries they run.
 * A repeatable one pays per completed multiple, which is the "and so on" in
 * "5 deliveries -> Rs.100, and so on": 5 pays cycle 0, 10 pays cycle 1, 15 pays
 * cycle 2.
 */
export const earnedCycles = (deliveredCount, requiredOrders, repeatable) => {
    const required = Math.max(1, Number(requiredOrders) || 1);
    const cycles = Math.floor(Number(deliveredCount || 0) / required);
    if (cycles <= 0) return 0;
    return repeatable ? cycles : 1;
};

/**
 * Award one cycle, or determine that it is already awarded.
 *
 * Reserves the redemption BEFORE writing the history row, and releases it if the
 * write turns out to be a duplicate. The other order works too, but its failure
 * mode does not: crashing between "row written" and "cap checked" leaves a
 * payable row that the cap never authorised. This way the same crash leaks a
 * redemption slot, which under-pays the cap by one rather than over-paying it.
 */
const awardCycle = async ({ offer, partnerId, vertical, cycle, deliveredCount, now }) => {
    const reserved = await reserveRedemption(offer._id, vertical);
    if (!reserved) return { awarded: false, reason: 'max_redemptions_reached' };

    let history;
    try {
        history = await FoodEarningAddonHistory.create({
            vertical,
            offerId: offer._id,
            deliveryPartnerId: partnerId,
            cycle,
            ordersCompleted: deliveredCount,
            ordersRequired: offer.requiredOrders,
            earningAmount: offer.earningAmount,
            totalEarning: offer.earningAmount,
            status: 'pending',
            completedAt: now
        });
    } catch (e) {
        await releaseRedemption(offer._id, vertical);
        if (e?.code === DUPLICATE_KEY) return { awarded: false, reason: 'already_awarded' };
        throw e;
    }

    if (!offer.autoCredit) {
        // Left for an admin to release. Tell the rider anyway -- they earned it,
        // and silence here is what made the feature look broken.
        void notifyRider(partnerId, {
            title: 'Incentive unlocked! 🎯',
            body: `You completed ${offer.requiredOrders} deliveries for "${offer.title}". ₹${offer.earningAmount} is pending approval.`,
            data: { type: 'incentive_unlocked', historyId: String(history._id), amount: String(offer.earningAmount) }
        });
        return { awarded: true, credited: false, historyId: String(history._id) };
    }

    const { creditEarningAddonHistory } = await import('../../admin/services/admin.service.js');
    await creditEarningAddonHistory(String(history._id), 'Auto-credited on delivery completion');
    return { awarded: true, credited: true, historyId: String(history._id) };
};

const notifyRider = async (partnerId, payload) => {
    try {
        const { notifyOwnerSafely } = await import('../../orders/services/order.helpers.js');
        await notifyOwnerSafely({ ownerType: 'DELIVERY_PARTNER', ownerId: String(partnerId) }, payload);
    } catch (e) {
        logger.warn(`incentive notification failed: ${e?.message || e}`);
    }
};

/**
 * Evaluate every live offer for one rider and award whatever they have earned.
 *
 * Safe to call as often as you like: the unique index means a re-run over
 * already-awarded cycles is a no-op. That is what lets the same function serve
 * both the per-delivery hook and the admin's bulk backfill.
 *
 * Never throws. It runs off the back of a completed delivery, and an incentive
 * that cannot be calculated must not fail the handover that triggered it.
 */
export const evaluateIncentivesForPartner = async (deliveryPartnerId, options = {}) => {
    try {
        const id = String(deliveryPartnerId || '');
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return { awarded: 0, reason: 'invalid_partner' };
        }

        const partnerId = new mongoose.Types.ObjectId(id);
        const vertical = resolveVertical(options.vertical);
        const now = options.now instanceof Date ? options.now : new Date();

        const offers = await FoodEarningAddon.find({
            vertical,
            status: 'active',
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        if (!offers.length) return { awarded: 0, reason: 'no_active_offers' };

        let awarded = 0;
        const results = [];

        for (const offer of offers) {
            const deliveredCount = await countDeliveriesInWindow({
                partnerId,
                vertical,
                startDate: offer.startDate,
                endDate: offer.endDate
            });

            const cycles = earnedCycles(deliveredCount, offer.requiredOrders, offer.repeatable);
            if (cycles <= 0) continue;

            // Which cycles are already on the ledger. Cancelled rows count: an
            // admin rejecting an award should not hand out a fresh attempt at it.
            const existing = await FoodEarningAddonHistory.find({
                vertical,
                offerId: offer._id,
                deliveryPartnerId: partnerId
            })
                .select('cycle')
                .lean();
            const done = new Set(existing.map((h) => Number(h.cycle) || 0));

            for (let cycle = 0; cycle < cycles; cycle += 1) {
                if (done.has(cycle)) continue;
                const result = await awardCycle({
                    offer,
                    partnerId,
                    vertical,
                    cycle,
                    deliveredCount,
                    now
                });
                if (result.awarded) awarded += 1;
                results.push({ offerId: String(offer._id), cycle, ...result });

                // Cap exhausted: no later cycle of this offer can succeed either.
                if (result.reason === 'max_redemptions_reached') break;
            }
        }

        if (awarded > 0) {
            logger.info(`[Incentive] Awarded ${awarded} incentive(s) to partner ${id} (${vertical})`);
        }
        return { awarded, results };
    } catch (e) {
        logger.warn(`evaluateIncentivesForPartner failed: ${e?.message || e}`);
        return { awarded: 0, reason: 'error' };
    }
};

/**
 * Bulk evaluation, behind the admin "check completions" button.
 *
 * Sequential rather than parallel on purpose: this walks every approved rider
 * and the cap reservation is a contended write per offer, so fanning it out
 * buys little and makes the write pattern spiky on a live cluster.
 */
export const evaluateIncentivesForAllPartners = async (options = {}) => {
    const { FoodDeliveryPartner } = await import('../models/deliveryPartner.model.js');
    const partners = await FoodDeliveryPartner.find({ status: 'approved' }).select('_id').lean();

    let awarded = 0;
    for (const partner of partners) {
        const result = await evaluateIncentivesForPartner(String(partner._id), options);
        awarded += Number(result?.awarded) || 0;
    }
    return { awarded, partnersScanned: partners.length };
};

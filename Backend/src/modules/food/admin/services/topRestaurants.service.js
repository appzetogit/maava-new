import mongoose from 'mongoose';
import { FoodTopRestaurantSlot } from '../models/topRestaurantSlot.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minutes since midnight in India, where every zone currently is. */
const istMinutesNow = (now) => {
    const ist = new Date(now.getTime() + 330 * 60 * 1000);
    return ist.getUTCHours() * 60 + ist.getUTCMinutes();
};

const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

/** [start, end) in minutes; an end before the start runs past midnight. */
const dailyRanges = (slot) => {
    if (!slot.dailyStart || !slot.dailyEnd) return [[0, 1440]];
    const s = toMinutes(slot.dailyStart);
    const e = toMinutes(slot.dailyEnd);
    return s < e ? [[s, e]] : [[s, 1440], [0, e]];
};

const inDailyWindow = (slot, minutes) =>
    dailyRanges(slot).some(([s, e]) => minutes >= s && minutes < e);

const dailyOverlap = (a, b) =>
    dailyRanges(a).some(([as, ae]) => dailyRanges(b).some(([bs, be]) => as < be && bs < ae));

/**
 * Restaurant ids pinned in [zoneId] right now, ordered by rank. The home
 * listing puts these first; anything else keeps its normal order.
 */
export const activeTopRestaurantIds = async (zoneId, now = new Date()) => {
    if (!zoneId || !mongoose.Types.ObjectId.isValid(String(zoneId))) return [];
    const slots = await FoodTopRestaurantSlot.find({
        zoneId: new mongoose.Types.ObjectId(String(zoneId)),
        startAt: { $lte: now },
        endAt: { $gt: now },
    }).lean();
    const minutes = istMinutesNow(now);
    const seen = new Set();
    return slots
        .filter((s) => inDailyWindow(s, minutes))
        .sort((a, b) => a.rank - b.rank)
        .map((s) => s.restaurantId)
        .filter((id) => !seen.has(String(id)) && seen.add(String(id)));
};

const parseInput = (body) => {
    const rank = Number(body.rank);
    if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
        throw new ValidationError('Rank must be a whole number from 1 to 10');
    }
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        throw new ValidationError('Start and end date/time are required');
    }
    if (endAt <= startAt) {
        throw new ValidationError('End date/time must be after the start');
    }
    const dailyStart = String(body.dailyStart || '').trim();
    const dailyEnd = String(body.dailyEnd || '').trim();
    if (Boolean(dailyStart) !== Boolean(dailyEnd)) {
        throw new ValidationError('Give both daily start and end times, or neither');
    }
    if (dailyStart && (!HHMM.test(dailyStart) || !HHMM.test(dailyEnd) || dailyStart === dailyEnd)) {
        throw new ValidationError('Daily hours must be different HH:mm times');
    }
    for (const key of ['zoneId', 'restaurantId']) {
        if (!mongoose.Types.ObjectId.isValid(String(body[key] || ''))) {
            throw new ValidationError(`${key} is required`);
        }
    }
    return {
        zoneId: new mongoose.Types.ObjectId(String(body.zoneId)),
        restaurantId: new mongoose.Types.ObjectId(String(body.restaurantId)),
        rank,
        startAt,
        endAt,
        dailyStart,
        dailyEnd,
        note: String(body.note || '').trim().slice(0, 120),
    };
};

/**
 * Refuses a slot that would put two restaurants on one rank, or one
 * restaurant on two ranks, in the same zone at the same moment.
 */
const assertNoClash = async (slot, excludeId) => {
    const overlapping = await FoodTopRestaurantSlot.find({
        zoneId: slot.zoneId,
        startAt: { $lt: slot.endAt },
        endAt: { $gt: slot.startAt },
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
        $or: [{ rank: slot.rank }, { restaurantId: slot.restaurantId }],
    }).lean();
    const clash = overlapping.find((o) => dailyOverlap(o, slot));
    if (!clash) return;
    if (clash.rank === slot.rank) {
        throw new ValidationError(`Rank ${slot.rank} is already booked in this zone for an overlapping time`);
    }
    throw new ValidationError('This restaurant already has a Top 10 slot in this zone for an overlapping time');
};

const assertRestaurantInZone = async (slot) => {
    const restaurant = await FoodRestaurant.findById(slot.restaurantId).select('zoneId status').lean();
    if (!restaurant) throw new NotFoundError('Restaurant not found');
    if (String(restaurant.zoneId || '') !== String(slot.zoneId)) {
        throw new ValidationError('This restaurant does not belong to the selected zone');
    }
};

export const listTopRestaurantSlots = async (query = {}) => {
    const filter = {};
    if (query.zoneId && mongoose.Types.ObjectId.isValid(String(query.zoneId))) {
        filter.zoneId = new mongoose.Types.ObjectId(String(query.zoneId));
    }
    if (query.status === 'current') filter.endAt = { $gt: new Date() };
    const slots = await FoodTopRestaurantSlot.find(filter)
        .sort({ zoneId: 1, rank: 1, startAt: 1 })
        .populate('restaurantId', 'restaurantName')
        .populate('zoneId', 'name zoneName')
        .lean();
    return { slots };
};

export const createTopRestaurantSlot = async (body) => {
    const slot = parseInput(body);
    await assertRestaurantInZone(slot);
    await assertNoClash(slot);
    return FoodTopRestaurantSlot.create(slot);
};

export const updateTopRestaurantSlot = async (id, body) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) throw new NotFoundError('Slot not found');
    const existing = await FoodTopRestaurantSlot.findById(id).lean();
    if (!existing) throw new NotFoundError('Slot not found');
    const slot = parseInput({ ...existing, ...body });
    await assertRestaurantInZone(slot);
    await assertNoClash(slot, existing._id);
    return FoodTopRestaurantSlot.findByIdAndUpdate(id, slot, { new: true }).lean();
};

export const deleteTopRestaurantSlot = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) throw new NotFoundError('Slot not found');
    const deleted = await FoodTopRestaurantSlot.findByIdAndDelete(id).lean();
    if (!deleted) throw new NotFoundError('Slot not found');
    return { id: String(deleted._id) };
};

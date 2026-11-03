import mongoose from 'mongoose';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { attachOutletTimingsToRestaurants } from '../../restaurant/services/outletTimings.service.js';
import {
    getOutletScheduleStatus,
    getRestaurantAvailabilityStatus,
} from '../../restaurant/helpers/restaurantAvailability.helper.js';
import { getRestaurantLocalTimeParts } from '../../../../utils/timezone.js';
import { haversineKm } from '../../orders/services/order.helpers.js';
import {
    estimateDeliveryPromiseMinutes,
    loadActiveFeeSettings,
    resolvePackingMinutes,
} from '../../orders/services/order-pricing.service.js';

const toMinutes = (value) => {
    const m = String(value || '').trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return h > 23 || min > 59 ? null : h * 60 + min;
};

const label = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * Is any Mart store serving this zone open right now?
 *
 * Mart shows products from every approved store in the customer's zone, so
 * the section is "closed" only when none of them can take an order: each is
 * switched offline by the seller, outside its hours, or closed for the day.
 * Uses the same availability check checkout does, so the banner and the
 * "store is closed" checkout error always agree.
 *
 * Returns { hasStores, isOpen, reason, opensAt } -- opensAt ("9:00 AM") only
 * when a store opens again later today.
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** That weekday's hours for a store: its outlet timings, else its plain fields. */
const dayWindow = (seller, dayName) => {
    const timings = seller?.outletTimings;
    const day = timings && typeof timings === 'object' && !Array.isArray(timings) ? timings[dayName] : null;
    if (day && day.isOpen === false) return null;
    const openDays = Array.isArray(seller?.openDays) ? seller.openDays.map((d) => String(d).toLowerCase()) : [];
    if (!day && openDays.length > 0 && !openDays.includes(dayName.toLowerCase())) return null;
    const opening = toMinutes(day?.openingTime || seller?.deliveryTimings?.openingTime || seller?.openingTime);
    const closing = toMinutes(day?.closingTime || seller?.deliveryTimings?.closingTime || seller?.closingTime);
    return opening === null || closing === null ? null : { opening, closing };
};

/**
 * Minutes from now until this store next opens, looking up to a week ahead --
 * so a shopper at 11:30 pm is told about 6:00 am tomorrow rather than nothing.
 * Null for a store switched off by hand: it has no scheduled reopening.
 */
const minutesUntilOpen = (seller, now) => {
    if (seller?.isActive === false || seller?.isAcceptingOrders === false) return null;
    const { dayName, nowMinutes } = getRestaurantLocalTimeParts(now);
    const todayIndex = DAY_NAMES.indexOf(dayName);
    for (let offset = 0; offset <= 7; offset += 1) {
        const window = dayWindow(seller, DAY_NAMES[(todayIndex + offset) % 7]);
        if (!window) continue;
        const until = offset * 24 * 60 + window.opening - nowMinutes;
        if (until > 0) return { until, opening: window.opening };
    }
    return null;
};

/**
 * One payload, two shapes: the flat fields older builds read, plus the
 * `storeStatus` object the app asked for. `deliveryMinutes` is the delivery
 * promise, the same number as `etaMinutes`.
 */
const withStoreStatus = (data) => ({
    ...data,
    deliveryMinutes: data.etaMinutes ?? null,
    storeStatus: {
        isOpen: data.isOpen,
        statusTitle: data.statusTitle ?? null,
        nextOpeningTimeText: data.nextOpeningTimeText ?? null,
        nextOpeningTime: data.nextOpeningTime ?? null,
        deliveryMinutes: data.etaMinutes ?? null,
        hours: data.hours ?? null,
        reason: data.reason,
    },
});

/** Straight-line km from [point] to a store, or null. */
const distanceTo = (seller, point) => {
    const lat = Number(seller?.location?.latitude ?? seller?.location?.coordinates?.[1]);
    const lng = Number(seller?.location?.longitude ?? seller?.location?.coordinates?.[0]);
    if (!point || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const km = haversineKm(point.lat, point.lng, lat, lng);
    return Number.isFinite(km) ? km : null;
};

/**
 * @param {object}  opts
 * @param {string}  opts.zoneId
 * @param {{lat:number,lng:number}} [opts.point] where the shopper is, for the ETA
 */
export async function getStoreStatus({ zoneId, point } = {}, now = new Date()) {
    const filter = { status: 'approved' };
    if (zoneId && mongoose.Types.ObjectId.isValid(String(zoneId))) {
        filter.zoneId = new mongoose.Types.ObjectId(String(zoneId));
    }
    const sellers = await FoodRestaurant.find(filter)
        .select('status zoneId isActive isAcceptingOrders openingTime closingTime openDays deliveryTimings location')
        .lean();
    if (sellers.length === 0) {
        return withStoreStatus({
            hasStores: false,
            isOpen: false,
            reason: 'no-stores',
            opensAt: null,
            hours: null,
            etaMinutes: null,
            statusTitle: null,
            nextOpeningTime: null,
            nextOpeningTimeText: null,
        });
    }

    const withTimings = await attachOutletTimingsToRestaurants(sellers, { useDefaults: false });
    const statuses = withTimings.map((s) => ({ seller: s, status: getRestaurantAvailabilityStatus(s, now) }));
    // Today's delivery hours across the zone's stores (earliest open, latest
    // close), shown even when a seller has switched off: "Please come back
    // between 6:00 am - 11:00 pm".
    let earliest = null;
    let latest = null;
    for (const { seller } of statuses) {
        const schedule = getOutletScheduleStatus(seller, now);
        if (schedule.isDayClosed) continue;
        const o = toMinutes(schedule.openingTime);
        const c = toMinutes(schedule.closingTime);
        if (o === null || c === null) continue;
        earliest = earliest === null ? o : Math.min(earliest, o);
        latest = latest === null ? c : Math.max(latest, c);
    }

    const hours = earliest === null ? null : `${label(earliest)} - ${label(latest)}`;

    const openSellers = statuses.filter((x) => x.status.isOpen).map((x) => x.seller);
    if (openSellers.length > 0) {
        // Same promise checkout makes: packing + the ride from the nearest open
        // store. Without a location there is no honest number to quote.
        let etaMinutes = null;
        const nearestKm = openSellers
            .map((seller) => distanceTo(seller, point))
            .filter((km) => km !== null)
            .reduce((best, km) => (best === null || km < best ? km : best), null);
        if (nearestKm !== null) {
            const feeSettings = await loadActiveFeeSettings(zoneId || null).catch(() => ({}));
            etaMinutes = estimateDeliveryPromiseMinutes(nearestKm, resolvePackingMinutes(feeSettings));
        }
        return withStoreStatus({
            hasStores: true,
            isOpen: true,
            reason: 'open',
            opensAt: null,
            hours,
            etaMinutes,
            statusTitle: null,
            nextOpeningTime: null,
            nextOpeningTimeText: null,
        });
    }

    // Earliest store that opens again later today (switched-off stores excluded).
    const { nowMinutes } = getRestaurantLocalTimeParts(now);
    let next = null;
    for (const { seller } of statuses) {
        if (seller.isActive === false || seller.isAcceptingOrders === false) continue;
        const schedule = getOutletScheduleStatus(seller, now);
        const opening = toMinutes(schedule.openingTime);
        if (!schedule.isDayClosed && opening !== null && opening > nowMinutes) {
            next = next === null ? opening : Math.min(next, opening);
        }
    }

    // The soonest any store reopens, today or on a later day.
    let soonest = null;
    for (const { seller } of statuses) {
        const open = minutesUntilOpen(seller, now);
        if (open && (soonest === null || open.until < soonest.until)) soonest = open;
    }
    const nextOpeningTime = soonest ? new Date(now.getTime() + soonest.until * 60000) : null;
    const nextOpeningLabel = soonest ? label(soonest.opening) : null;

    const allOffline = statuses.every((x) => x.status.reason === 'not-accepting-orders' || x.status.reason === 'inactive');
    return withStoreStatus({
        hasStores: true,
        isOpen: false,
        reason: allOffline ? 'offline' : 'outside-hours',
        opensAt: next === null ? null : label(next),
        hours,
        etaMinutes: null,
        statusTitle: 'Store closed',
        nextOpeningTime: nextOpeningTime ? nextOpeningTime.toISOString() : null,
        nextOpeningTimeText: nextOpeningLabel
            ? `Please come back at ${nextOpeningLabel.toLowerCase()}`
            : hours
                ? `Please come back between ${hours.toLowerCase()}`
                : 'Please come back later',
    });
}

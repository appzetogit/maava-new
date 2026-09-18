import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { findZoneForPoint, readAddressPoint } from '../../shared/zoneServiceability.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import {
  calculateDistanceKm,
  normalizeDeliveryAddress,
  normalizeRestaurantLocation,
  parseGeoPoint,
} from '../../shared/geo.utils.js';
import { fetchDrivingRoute } from '../utils/googleMaps.js';
import { attachOutletTimingsToRestaurants } from '../../restaurant/services/outletTimings.service.js';
import { getRestaurantAvailabilityStatus } from '../../restaurant/helpers/restaurantAvailability.helper.js';
import { resolveOrderCartItems } from '../helpers/order-cart-items.helper.js';
import { AVG_SPEED_KMPH, DEFAULT_PACKING_MINUTES } from './order.helpers.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Default GST on delivery fee (a distinct supply of service from the food
 * itself) when the admin has not configured `feeSettings.deliveryFeeGstRate`.
 * Kept as the fallback rather than removed so an unconfigured store's total
 * does not change.
 */
export const DELIVERY_FEE_GST_RATE = 0.18;

/**
 * Ceiling on a rider tip, in rupees.
 *
 * The tip arrives from the client and is paid straight through to the rider,
 * so an unbounded value is a way to mint a payout. ₹1000 is far above any
 * real tip on a food order and still low enough to be worth nothing to abuse.
 */
export const MAX_DELIVERY_TIP = 1000;

/**
 * A tip the pricing math can trust: a finite, non-negative, 2dp number no
 * larger than the cap. Anything else -- a string, NaN, Infinity, a negative
 * meant to shrink the bill -- becomes 0 rather than throwing, because the
 * validator has already rejected genuinely malformed requests and a quote
 * should not die over a junk optional field.
 */
export function normalizeDeliveryTip(value) {
  const tip = Number(value);
  if (!Number.isFinite(tip) || tip <= 0) return 0;
  return round2(Math.min(tip, MAX_DELIVERY_TIP));
}

/** `rate` is a fraction (0.18), not a percentage — callers with a
 * percentage from fee settings must divide by 100 first. */
export function computeDeliveryFeeGst(deliveryFee, rate = DELIVERY_FEE_GST_RATE) {
  const base = Math.max(0, Number(deliveryFee) || 0);
  if (base <= 0) return 0;
  return round2(base * (Number(rate) || 0));
}

/** Admin-configured delivery-fee GST %, or the fallback default. Kept in one
 * place so every caller agrees on what "unconfigured" means.
 *
 * Unconfigured is blank -- null, undefined or an empty string -- and only that
 * gets the 18% default. This used to test `> 0`, which read an explicit 0 as
 * blank too: a zone set to 0% delivery GST went on charging 18%. */
export function resolveDeliveryFeeGstRatePercent(feeSettings = {}) {
  const raw = feeSettings?.deliveryFeeGstRate;
  if (raw === null || raw === undefined || raw === '') {
    return DELIVERY_FEE_GST_RATE * 100;
  }
  const configured = Number(raw);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DELIVERY_FEE_GST_RATE * 100;
}

const applyDeliveryModePricing = (pricing, deliveryMode, quickSurcharge = 0) => {
  const surcharge = Math.max(0, Number(quickSurcharge) || 0);
  const mode = deliveryMode === 'quick' ? 'quick' : 'basic';
  if (mode !== 'quick' || surcharge <= 0) {
    return {
      ...pricing,
      deliveryMode: mode,
      quickDeliveryFee: 0,
    };
  }
  const platformFee = round2((Number(pricing.platformFee) || 0) + surcharge);
  const total = round2((Number(pricing.total) || 0) + surcharge);
  return {
    ...pricing,
    platformFee,
    total,
    deliveryMode: mode,
    quickDeliveryFee: surcharge,
  };
};


export async function loadRestaurantForOrdering(restaurantId) {
  if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
    throw new ValidationError('Restaurant not found');
  }

  const doc = await FoodRestaurant.findById(restaurantId)
    .select(
      // autoAcceptOrders is read at order creation to decide whether the order
      // waits for a seller. Left out of this projection it is always undefined,
      // so the flag silently does nothing however it is set.
      'status restaurantName zoneId location isAcceptingOrders autoAcceptOrders outsideHoursOverride openingTime closingTime openDays deliveryTimings isActive',
    )
    .lean();

  if (!doc) throw new ValidationError('Restaurant not found');
  if (doc.status !== 'approved') throw new ValidationError('Restaurant not available');

  const [withTimings] = await attachOutletTimingsToRestaurants([doc], {
    useDefaults: false,
  });
  if (withTimings?.location) {
    withTimings.location = normalizeRestaurantLocation(withTimings.location);
  }
  return withTimings;
}

export function assertRestaurantOpenForOrdering(restaurant, at = new Date()) {
  const availability = getRestaurantAvailabilityStatus(restaurant, at);
  if (availability.isOpen) return availability;

  if (availability.reason === 'not-accepting-orders') {
    throw new ValidationError('Restaurant is currently offline. Please try again later.');
  }

  throw new ValidationError('Restaurant is currently closed. Please try again later.');
}

/**
 * Single source of truth for restaurant ↔ customer trip distance.
 * Prefer Google driving/road km (matches delivery partner Rest→User UI);
 * fall back to Haversine when Directions is unavailable.
 */
export async function getDeliveryDistanceKm(restaurant, deliveryAddress) {
  const straightLineKm = calculateDistanceKm(restaurant, deliveryAddress);

  const restaurantPoint = parseGeoPoint(restaurant);
  const customerPoint = parseGeoPoint(deliveryAddress);
  if (!restaurantPoint || !customerPoint) {
    return straightLineKm;
  }

  try {
    const route = await fetchDrivingRoute(
      { lat: restaurantPoint.lat, lng: restaurantPoint.lng },
      { lat: customerPoint.lat, lng: customerPoint.lng },
    );
    if (route?.distanceKm != null && Number.isFinite(Number(route.distanceKm))) {
      return Number(route.distanceKm);
    }
  } catch {
    // Fall through to Haversine.
  }

  return straightLineKm;
}

// Single money-rounding rule (2 decimals) so preview and charged totals always match.

function resolveBaseDeliveryFee(feeSettings = {}) {
  const ranges = Array.isArray(feeSettings.deliveryFeeRanges)
    ? feeSettings.deliveryFeeRanges
    : [];
  const rangeFees = ranges
    .map((range) => Number(range?.fee))
    .filter((fee) => Number.isFinite(fee) && fee >= 0);

  const flat = Number(feeSettings.deliveryFee);
  const hasPositiveFlat = Number.isFinite(flat) && flat > 0;

  if (rangeFees.length > 0) {
    const minRangeFee = Math.min(...rangeFees);
    return hasPositiveFlat ? flat : minRangeFee;
  }

  return Number.isFinite(flat) && flat >= 0 ? flat : 0;
}

function matchFeeRange(ranges, distanceKm, pickValue) {
  if (!Array.isArray(ranges) || ranges.length === 0 || !Number.isFinite(distanceKm)) {
    return null;
  }

  const sorted = [...ranges].sort((a, b) => Number(a.min) - Number(b.min));
  for (let i = 0; i < sorted.length; i += 1) {
    const range = sorted[i] || {};
    const min = Number(range.min);
    const max = Number(range.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue;

    const isLast = i === sorted.length - 1;
    const inRange = isLast
      ? distanceKm >= min && distanceKm <= max
      : distanceKm >= min && distanceKm < max;

    if (inRange) {
      const value = pickValue(range);
      return Number.isFinite(value) ? value : null;
    }
  }

  return null;
}

/**
 * A zone's record laid over the default one, field by field. Kept here rather
 * than imported from admin.service, which imports from orders.
 */
function overlayZoneFeeSettings(defaults, zoneDoc) {
  if (!zoneDoc) return defaults || null;
  if (!defaults) return zoneDoc;
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(zoneDoc)) {
    if (['_id', 'createdAt', 'updatedAt', '__v'].includes(key)) continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    merged[key] = value;
  }
  return merged;
}

/**
 * Fees for a zone: the zone's own record laid over the default one. Without a
 * zone, or for a zone that has none of its own, this is the default record,
 * exactly as before.
 */
export async function loadActiveFeeSettings(zoneId = null) {
  const active = { isActive: { $ne: false } };
  const feeDefault = await FoodFeeSettings.findOne({
    ...active,
    $or: [{ zoneId: null }, { zoneId: { $exists: false } }]
  })
    .sort({ createdAt: -1 })
    .lean();

  const zoneRaw = String(zoneId || '').trim();
  const feeZone =
    zoneRaw && mongoose.Types.ObjectId.isValid(zoneRaw)
      ? await FoodFeeSettings.findOne({ ...active, zoneId: new mongoose.Types.ObjectId(zoneRaw) })
          .sort({ createdAt: -1 })
          .lean()
      : null;

  const feeDoc = overlayZoneFeeSettings(feeDefault, feeZone);

  return (
    feeDoc || {
      deliveryFee: 0,
      deliveryFeeRanges: [],
      platformFee: 0,
      gstRate: 0,
    }
  );
}

/**
 * The delivery promise quoted at checkout: packing, then the ride.
 *
 * Same speed and packing constants the live countdown uses, so a customer is
 * not quoted one number before ordering and shown a different one after.
 */
export function estimateDeliveryPromiseMinutes(distanceKm, packingMinutes = DEFAULT_PACKING_MINUTES) {
  // Number(null) is 0, so an unknown distance would otherwise quote the packing
  // time alone -- a confident promise built on a distance nobody measured.
  if (distanceKm === null || distanceKm === undefined || distanceKm === '') return null;
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km < 0) return null;
  const packing = Number.isFinite(Number(packingMinutes)) && Number(packingMinutes) >= 0
    ? Number(packingMinutes)
    : DEFAULT_PACKING_MINUTES;
  return Math.ceil(packing + (km / AVG_SPEED_KMPH) * 60);
}

/**
 * Packing minutes for a vertical, from its fee settings, falling back to the
 * env var and then to 3. Split out so the quote and the live countdown cannot
 * resolve it differently.
 */
export function resolvePackingMinutes(feeSettings = {}) {
  const raw = feeSettings?.packingMinutes;
  // The field defaults to null. Number(null) is 0 and passes isFinite, so an
  // unconfigured vertical was quoting zero packing time and stamping that zero
  // onto every order it priced.
  if (raw === null || raw === undefined || raw === '') return DEFAULT_PACKING_MINUTES;
  const configured = Number(raw);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_PACKING_MINUTES;
}

const parseBands = (value) => String(value ?? '')
  .split(',')
  .map((entry) => Number(String(entry).trim()))
  .filter((entry) => Number.isFinite(entry) && entry > 0);

/**
 * Rider search radius per dispatch attempt, widest last.
 *
 * Settings first, then DISPATCH_RADIUS_BANDS_KM, then 3/5/8/12. The env tier is
 * kept because it is what a deployment can change without waiting for someone to
 * open the admin panel, and rider density is exactly the kind of thing that gets
 * tuned at 2am.
 */
export async function resolveDispatchRadiusBands() {
  const feeSettings = await loadActiveFeeSettings();
  const configured = Array.isArray(feeSettings.dispatchRadiusBandsKm)
    ? feeSettings.dispatchRadiusBandsKm.filter((n) => Number.isFinite(Number(n)) && Number(n) > 0).map(Number)
    : [];
  if (configured.length > 0) return configured;

  const fromEnv = parseBands(process.env.DISPATCH_RADIUS_BANDS_KM);
  return fromEnv.length > 0 ? fromEnv : [3, 5, 8, 12];
}

/**
 * GST across a basket whose lines can sit in different slabs.
 *
 * Groceries are taxed per product — flour at 0, biscuits at 18 — so charging
 * one rate on the whole basket is wrong in both directions depending on what
 * the customer bought. A line with no rate of its own falls back to the
 * order-wide rate, which makes this identical to the old single-rate maths for
 * any basket of items that predate per-product slabs.
 *
 * The discount reduces every line in proportion to its share of the basket,
 * because a basket-level coupon is not attributable to any one product.
 */
export function computeItemsTax(items = [], { subtotal = 0, discount = 0, fallbackRate = 0 } = {}) {
  if (!(subtotal > 0)) return 0;

  const taxableShare = Math.max(0, subtotal - discount) / subtotal;
  let tax = 0;

  for (const item of items) {
    // null and undefined mean "no slab of its own" and must reach the fallback.
    // Number(null) is 0, so testing the coerced value would silently make every
    // untagged item tax-free.
    const own = item?.gstRate;
    const hasOwnRate = own !== null && own !== undefined && Number.isFinite(Number(own));
    const rate = hasOwnRate ? Number(own) : Number(fallbackRate) || 0;
    if (!(rate > 0)) continue;

    const lineValue = (Number(item?.price) || 0) * (Number(item?.quantity) || 1);
    tax += lineValue * taxableShare * (rate / 100);
  }

  return Math.round(tax);
}

export function resolveUserDeliveryFee(feeSettings = {}, { subtotal = 0, distanceKm = null } = {}) {
  // The "Get free delivery" progress the cart shows the shopper is a promise,
  // not decoration — `subtotal` was already being threaded in here for this
  // exact check, it just never ran. 0 (the schema default) means the rule is
  // off, same convention as every other admin threshold in this codebase.
  const threshold = Number(feeSettings.freeDeliveryThreshold);
  if (Number.isFinite(threshold) && threshold > 0 && Number(subtotal) >= threshold) {
    return {
      deliveryFee: 0,
      distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : null,
      source: 'free_delivery_threshold',
    };
  }

  // Distance pricing: the base fee covers the base distance, then the distance
  // beyond it is charged pro rata -- 6.2 km with a 3 km base is 3.2 extra
  // kilometres. Only the final amount is rounded, to whole rupees.
  const baseKm = Number(feeSettings.baseDeliveryKm);
  const baseFee = Number(feeSettings.baseDeliveryFee);
  if (
    Number.isFinite(baseFee) &&
    baseFee >= 0 &&
    Number.isFinite(baseKm) &&
    baseKm >= 0 &&
    Number.isFinite(distanceKm)
  ) {
    const perKm = Number(feeSettings.perKmFee);
    const perKmFee = Number.isFinite(perKm) && perKm > 0 ? perKm : 0;
    const extraKm = Math.max(0, Number((distanceKm - baseKm).toFixed(2)));
    const cap = Number(feeSettings.maxDeliveryFee);
    const uncapped = baseFee + extraKm * perKmFee;
    const capped = Number.isFinite(cap) && cap > 0 ? Math.min(uncapped, cap) : uncapped;
    return {
      deliveryFee: Math.round(capped),
      distanceKm: Number(distanceKm.toFixed(2)),
      source: 'base_per_km',
      breakdown: {
        baseKm,
        baseFee,
        perKmFee,
        extraKm,
        cappedAt: Number.isFinite(cap) && cap > 0 ? cap : null
      }
    };
  }

  const ranges = Array.isArray(feeSettings.deliveryFeeRanges)
    ? feeSettings.deliveryFeeRanges
    : [];

  if (ranges.length > 0 && Number.isFinite(distanceKm)) {
    const matchedFee = matchFeeRange(ranges, distanceKm, (range) => Number(range.fee));
    if (Number.isFinite(matchedFee)) {
      return {
        deliveryFee: matchedFee,
        distanceKm: Number(distanceKm.toFixed(2)),
        source: 'distance',
      };
    }
  }

  const fallbackFee = resolveBaseDeliveryFee(feeSettings);
  return {
    deliveryFee: fallbackFee,
    distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : null,
    source: Number.isFinite(distanceKm) ? 'default_unmatched_range' : 'default',
  };
}

/**
 * Rider pay under base + per extra km, or null when that is not configured.
 *
 * Kept apart from the bands on purpose: a band pays a flat amount or a per-km
 * rate on the whole trip, so "Rs 20 for the first km, Rs 5 for each km after"
 * could not be written down at all. Extra distance is pro rata, like the
 * customer side; only the result is rounded.
 */
function calculateRiderBasePerKm(feeSettings, distanceKm) {
  const raw = feeSettings?.riderBasePay;
  if (raw === null || raw === undefined || raw === '') return null;
  const basePay = Number(raw);
  if (!Number.isFinite(basePay) || basePay < 0) return null;

  const baseKm = Math.max(0, Number(feeSettings.riderBaseKm) || 0);
  const perKm = Math.max(0, Number(feeSettings.riderPerKmPay) || 0);
  // An unknown distance pays the base: the trip happened, its length is what
  // is missing, and guessing long would overpay on one bad coordinate.
  const km = Number.isFinite(Number(distanceKm)) && distanceKm !== null && distanceKm !== ''
    ? Math.max(0, Number(distanceKm))
    : 0;
  const extraKm = Math.max(0, Number((km - baseKm).toFixed(2)));
  const uncapped = basePay + extraKm * perKm;
  const cap = Number(feeSettings.riderMaxPay);
  const pay = Number.isFinite(cap) && cap > 0 ? Math.min(uncapped, cap) : uncapped;
  return Math.round(pay);
}

/**
 * One line a customer can read: the distance, and for per-km pricing the sum
 * behind the fee -- "11.5 km · first 1 km ₹20 + 10.5 km × ₹5".
 */
function describeDeliveryFee(result, distanceKm) {
  if (!Number.isFinite(distanceKm)) return null;
  const km = (value) => {
    const n = Number(value);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };
  const b = result?.breakdown;
  if (result?.source === 'base_per_km' && b) {
    const base = `first ${km(b.baseKm)} km ₹${km(b.baseFee)}`;
    if (!(Number(b.extraKm) > 0)) return `${km(distanceKm)} km · ${base}`;
    // cappedAt is the cap whenever one is set; only say so when it bit.
    const hitCap = Number(b.cappedAt) > 0 && Number(result.deliveryFee) >= Number(b.cappedAt);
    const capped = hitCap ? ` (capped at ₹${km(b.cappedAt)})` : '';
    return `${km(distanceKm)} km · ${base} + ${km(b.extraKm)} km × ₹${km(b.perKmFee)}${capped}`;
  }
  return `Distance: ${km(distanceKm)} km`;
}

export function calculateRiderEarning(feeSettings = {}, distanceKm) {
  // Base + per extra km wins when it is set; the bands are the fallback.
  const basePerKm = calculateRiderBasePerKm(feeSettings, distanceKm);
  if (basePerKm !== null) return basePerKm;

  const ranges = Array.isArray(feeSettings.deliveryFeeRanges)
    ? feeSettings.deliveryFeeRanges
    : [];
  if (ranges.length === 0) return 0;

  // basePay and perKm are mutually exclusive (the admin UI enforces this too):
  // a flat basePay wins, otherwise pay per km of the actual trip.
  const payFor = (range, km) => {
    const basePay = Number(range?.deliveryBoyBasePay || 0);
    const perKm = Number(range?.deliveryBoyPerKm || 0);

    if (basePay > 0) return basePay;
    if (perKm > 0) return km * perKm;
    return 0;
  };

  // An unknown distance is not a zero-kilometre trip.
  //
  // Number(null) is 0, and 0 is finite and non-negative, so coercing before
  // testing made every order whose distance could not be resolved look like a
  // delivery to the shop's own door. calculateDistanceKm returns null (not 0)
  // when either endpoint lacks coordinates, and resolveUserDeliveryFee already
  // tells the two apart -- it tests Number.isFinite on the raw value, which is
  // false for null. This did not, so the customer correctly fell back to the
  // base fee while the rider was paid for 0 km.
  //
  // Falls back to the shortest band, mirroring the customer side's fallback to
  // the base fee. Deliberately not the widest band: one missing coordinate
  // should not trigger a full long-distance payout. A perKm-only band is
  // credited one kilometre so a real delivery never pays nothing.
  if (distanceKm === null || distanceKm === undefined || distanceKm === '') {
    const shortest = [...ranges].sort((a, b) => Number(a?.min ?? 0) - Number(b?.min ?? 0))[0];
    const guaranteed = payFor(shortest, 1);
    return Number.isFinite(guaranteed) ? Math.round(guaranteed) : 0;
  }

  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance < 0) return 0;

  const matched = matchFeeRange(ranges, distance, (range) => payFor(range, distance));
  // A matched band is authoritative — including an explicit 0.
  if (matched != null && Number.isFinite(matched)) return Math.round(matched);

  // No band covers this distance. The customer is still charged (resolveUserDeliveryFee
  // falls back to the base fee), so paying the rider 0 here would mean unpaid work on a
  // real delivery whenever the bands don't span the dispatch radius. Fall back to the
  // widest configured band instead of silently zeroing the payout.
  const widest = [...ranges].sort(
    (a, b) => Number(a?.max ?? 0) - Number(b?.max ?? 0),
  )[ranges.length - 1];
  const fallback = payFor(widest, distance);
  return Number.isFinite(fallback) ? Math.round(fallback) : 0;
}

/**
 * The address the trip should be priced against.
 *
 * Order creation passes a full `deliveryAddress`, but the checkout preview only
 * ever sends `deliveryAddressId`, and the cart summary sends neither — nothing
 * resolved either, so `distanceKm` came out null on every preview and the
 * distance bands were skipped entirely in favour of the flat fallback fee. The
 * customer saw one delivery charge at checkout and was billed another on
 * placing the order.
 *
 * An explicitly chosen address wins even when it has no coordinates: pricing a
 * different address than the one the customer picked would be worse than
 * falling back to the flat fee.
 */
async function resolveDeliveryAddress(userId, dto) {
  if (parseGeoPoint(dto.deliveryAddress)) return dto.deliveryAddress;
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    return dto.deliveryAddress;
  }

  const user = await FoodUser.findById(userId).select('addresses').lean();
  const addresses = Array.isArray(user?.addresses) ? user.addresses : [];
  if (addresses.length === 0) return dto.deliveryAddress;

  const wantedId = String(dto.deliveryAddressId || '').trim();
  const chosen =
    (wantedId && addresses.find((entry) => String(entry?._id) === wantedId)) ||
    addresses.find((entry) => entry?.isDefault) ||
    addresses[0];

  return chosen || dto.deliveryAddress;
}

/**
 * The welcome for people who just joined: delivery is free for their first few
 * orders, for a while after signing up, or both. Only delivered orders count, so
 * a cancelled first order does not burn it, and the rider is still paid as usual.
 */
async function resolveNewCustomerFreeDelivery(userId, feeSettings, subtotal) {
  if (!feeSettings?.newCustomerFreeDelivery || !userId) return null;

  const minOrder = Number(feeSettings.newCustomerMinOrder);
  if (Number.isFinite(minOrder) && minOrder > 0 && Number(subtotal) < minOrder) return null;

  const maxOrders = Number(feeSettings.newCustomerFreeDeliveryOrders);
  const withinDays = Number(feeSettings.newCustomerFreeDeliveryDays);
  const hasOrderLimit = Number.isFinite(maxOrders) && maxOrders > 0;
  const hasDayLimit = Number.isFinite(withinDays) && withinDays > 0;
  if (!hasOrderLimit && !hasDayLimit) return null;

  if (hasDayLimit) {
    const user = await FoodUser.findById(userId).select('createdAt').lean();
    const joinedAt = user?.createdAt ? new Date(user.createdAt).getTime() : null;
    if (!joinedAt) return null;
    if (Date.now() - joinedAt > withinDays * 24 * 60 * 60 * 1000) return null;
  }

  let ordersLeft = null;
  if (hasOrderLimit) {
    const delivered = await FoodOrder.countDocuments({
      userId: new mongoose.Types.ObjectId(String(userId)),
      orderStatus: 'delivered'
    });
    if (delivered >= maxOrders) return null;
    ordersLeft = maxOrders - delivered;
  }

  return {
    ordersLeft,
    maxOrders: hasOrderLimit ? maxOrders : null,
    withinDays: hasDayLimit ? withinDays : null
  };
}

async function resolveFeeZoneId(deliveryAddress, restaurant, dto) {
  const point = readAddressPoint(deliveryAddress);
  if (point) {
    try {
      const zone = await findZoneForPoint(point.lat, point.lng);
      if (zone?._id) return String(zone._id);
    } catch {
      // fall through to the seller's zone
    }
  }
  if (restaurant?.zoneId) return String(restaurant.zoneId);
  const raw = String(dto?.zoneId || '').trim();
  return raw || null;
}

export async function calculateOrderPricing(userId, dto, options = {}) {
  const at = options.at instanceof Date ? options.at : new Date();
  const restaurant =
    options.restaurant || (await loadRestaurantForOrdering(dto.restaurantId));

  if (!options.skipAvailabilityCheck) {
    assertRestaurantOpenForOrdering(restaurant, at);
  }

  const deliveryAddress = normalizeDeliveryAddress(
    await resolveDeliveryAddress(userId, dto),
  );

  const resolvedItems = await resolveOrderCartItems(dto.restaurantId, dto.items);
  const items = resolvedItems.map((item) => ({
    ...item,
    price: Number(item.price) || 0,
    quantity: Number(item.quantity) || 1,
  }));
  const subtotal = round2(
    items.reduce(
      (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
      0,
    ),
  );

  // Zone-wise fees: the area the food is delivered to decides the fee, and the
  // seller's zone stands in when the address cannot be placed on the map.
  const feeZoneId = await resolveFeeZoneId(deliveryAddress, restaurant, dto);
  const feeSettings = await loadActiveFeeSettings(feeZoneId);

  // Packaging is set per zone in the admin panel: a flat amount for the order
  // plus an optional amount for each item boxed. It goes to the restaurant, so
  // it is charged on top of the basket and never discounted with a coupon.
  const packedItemCount = items.reduce(
    (count, it) => count + (Number(it.quantity) || 1),
    0,
  );
  const packagingFee = round2(
    (Number(feeSettings.packagingFee) || 0) +
      (Number(feeSettings.packagingFeePerItem) || 0) * packedItemCount,
  );
  const platformFee = Number(feeSettings.platformFee || 0);

  let distanceKm = await getDeliveryDistanceKm(restaurant, deliveryAddress);
  const straightLineKm = calculateDistanceKm(restaurant, deliveryAddress);

  const deliveryFeeResult = resolveUserDeliveryFee(feeSettings, { subtotal, distanceKm });
  // A new customer's welcome waives the fee that was just worked out, so the
  // bill still shows which rule would otherwise have applied.
  const newCustomerWelcome = await resolveNewCustomerFreeDelivery(userId, feeSettings, subtotal);
  const deliveryFee = round2(newCustomerWelcome ? 0 : deliveryFeeResult.deliveryFee);
  distanceKm = deliveryFeeResult.distanceKm ?? distanceKm;

  let discount = 0;
  let appliedCoupon = null;
  const codeRaw = dto.couponCode
    ? String(dto.couponCode).trim().toUpperCase()
    : "";

  if (codeRaw) {
    const now = new Date();
    const offer = await FoodOffer.findOne({ couponCode: codeRaw }).lean();
    if (offer) {
      const offerEnd = offer.endDate ? new Date(offer.endDate) : null;
      if (offerEnd && offerEnd.getHours() === 0 && offerEnd.getMinutes() === 0) {
        offerEnd.setHours(23, 59, 59, 999);
      }
      const endOk = !offerEnd || now <= offerEnd;
      const startOk = !offer.startDate || now >= new Date(offer.startDate);
      const statusOk = offer.status === "active" && offer.showInCart !== false;
      const selectedRestaurantIds = Array.isArray(offer.restaurantIds) && offer.restaurantIds.length > 0
        ? offer.restaurantIds
        : [offer.restaurantId].filter(Boolean);
      const scopeOk =
        offer.restaurantScope !== "selected" ||
        selectedRestaurantIds.some((id) => String(id) === String(dto.restaurantId || ""));
      // Zone-wise offers: a code limited to zones only applies to an order
      // delivered into one of them.
      const offerZoneIds = Array.isArray(offer.zoneIds) ? offer.zoneIds : [];
      const zoneOk =
        offer.zoneScope !== 'selected' ||
        Boolean(feeZoneId && offerZoneIds.some((id) => String(id) === String(feeZoneId)));
      const minOk = subtotal >= (Number(offer.minOrderValue) || 0);
      let usageOk = true;
      if (
        Number(offer.usageLimit) > 0 &&
        Number(offer.usedCount || 0) >= Number(offer.usageLimit)
      ) {
        usageOk = false;
      }

      let perUserOk = true;
      if (userId && mongoose.Types.ObjectId.isValid(userId) && Number(offer.perUserLimit) > 0) {
        const usage = await FoodOfferUsage.findOne({
          offerId: offer._id,
          userId: new mongoose.Types.ObjectId(userId),
        }).lean();
        if (usage && Number(usage.count) >= Number(offer.perUserLimit)) {
          perUserOk = false;
        }
      }

      let firstOrderOk = true;
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        if (offer.customerScope === "first-time") {
          const c = await FoodOrder.countDocuments({
            userId: new mongoose.Types.ObjectId(userId),
          });
          firstOrderOk = c === 0;
        }
        if (offer.isFirstOrderOnly === true) {
          const c2 = await FoodOrder.countDocuments({
            userId: new mongoose.Types.ObjectId(userId),
          });
          if (c2 > 0) firstOrderOk = false;
        }
      }

      const allowed =
        statusOk &&
        startOk &&
        endOk &&
        scopeOk &&
        zoneOk &&
        minOk &&
        usageOk &&
        perUserOk &&
        firstOrderOk;

      if (allowed) {
        if (offer.discountType === "percentage") {
          const raw = subtotal * (Number(offer.discountValue) / 100);
          const capped = Number(offer.maxDiscount)
            ? Math.min(raw, Number(offer.maxDiscount))
            : raw;
          discount = Math.max(0, Math.min(subtotal, Math.floor(capped)));
        } else {
          discount = Math.max(
            0,
            Math.min(subtotal, Math.floor(Number(offer.discountValue) || 0)),
          );
        }
        appliedCoupon = { code: codeRaw, discount };
      }
    }
  }

  // GST is charged on the post-discount item value (discount is already clamped to <= subtotal).
  const gstRate = Number(feeSettings.gstRate || 0);
  const tax = computeItemsTax(items, {
    subtotal,
    discount,
    fallbackRate: gstRate,
  });

  const deliveryFeeGstRate = resolveDeliveryFeeGstRatePercent(feeSettings);
  const deliveryFeeGst = computeDeliveryFeeGst(deliveryFee, deliveryFeeGstRate / 100);

  // Added after the discount, never before it: a tip is money for the rider,
  // not part of the order value, so a coupon must not discount it and a
  // percentage-off must not be computed against it.
  const deliveryTip = normalizeDeliveryTip(dto.deliveryTip);

  const total = round2(
    Math.max(
      0,
      subtotal + packagingFee + deliveryFee + deliveryFeeGst + platformFee + tax - discount,
    ) + deliveryTip,
  );

  const basePricing = {
    subtotal,
    tax,
    // The rate `tax`/`deliveryFeeGst` were actually charged at, so the client
    // can label the amount instead of guessing — see the comment on
    // pricingSchema.gstRate for why this was missing before.
    gstRate,
    packagingFee,
    deliveryFee,
    deliveryFeeGst,
    deliveryFeeGstRate,
    platformFee,
    discount,
    deliveryTip,
    total,
    currency: "INR",
    couponCode: appliedCoupon?.code || codeRaw || null,
    appliedCoupon,
    distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : null,
    roadDistanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : null,
    straightLineDistanceKm: Number.isFinite(straightLineKm)
      ? Number(straightLineKm.toFixed(2))
      : null,
    deliveryFeeBreakdown: deliveryFeeResult.breakdown || null,
    // Why delivery costs what it does, so the cart can say "FREE" and explain.
    deliveryFeeReason: newCustomerWelcome ? 'new_customer' : deliveryFeeResult.source || null,
    newCustomerFreeDelivery: newCustomerWelcome
      ? {
          ordersLeft: newCustomerWelcome.ordersLeft,
          maxOrders: newCustomerWelcome.maxOrders,
          withinDays: newCustomerWelcome.withinDays
        }
      : null,
    // Shown before the customer commits, which is the whole point of a
    // quick-commerce promise: it is a reason to order, not a status to check
    // afterwards. Packing plus the ride, from the same numbers the live
    // countdown uses, so the quote and the tracking screen agree.
    deliveryPromiseMinutes: estimateDeliveryPromiseMinutes(
      distanceKm,
      resolvePackingMinutes(feeSettings),
    ),
    // Snapshotted so the live countdown on the tracking screen uses the number
    // this order was quoted with, not whatever settings say by the time someone
    // opens it.
    packingMinutes: resolvePackingMinutes(feeSettings),
  };

  const pricing = applyDeliveryModePricing(
    basePricing,
    dto.deliveryMode,
    Number(feeSettings.quickDeliveryFee) || 0,
  );

  const priceChanges = (Array.isArray(dto.items) ? dto.items : [])
    .map((rawItem) => {
      const itemId = String(rawItem?.itemId || rawItem?.id || '').trim();
      const resolved = items.find((entry) => String(entry.itemId) === itemId);
      if (!resolved) return null;

      const previousPrice = Number(rawItem?.price);
      const nextPrice = Number(resolved.price);
      if (!Number.isFinite(previousPrice) || previousPrice === nextPrice) return null;

      return {
        itemId,
        name: resolved.name,
        previousPrice,
        price: nextPrice,
      };
    })
    .filter(Boolean);

  return {
    items,
    priceChanges,
    // The zone this order was priced in, so rider pay reads the same zone's
    // settings instead of the default record.
    feeZoneId: feeZoneId ? String(feeZoneId) : null,
    pricing: {
      ...pricing,
      deliveryFeeBreakdown: {
        // The per-km detail (baseKm, baseFee, perKmFee, extraKm, cappedAt) when
        // that rule set the fee. This block used to replace it outright, so no
        // app could show how the fee was reached. baseDeliveryKm is the name the
        // customer app reads.
        ...(deliveryFeeResult.breakdown || {}),
        ...(deliveryFeeResult.breakdown
          ? { baseDeliveryKm: deliveryFeeResult.breakdown.baseKm }
          : {}),
        source: deliveryFeeResult.source,
        distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : null,
        deliveryFee,
        message: describeDeliveryFee(deliveryFeeResult, distanceKm),
      },
    },
  };
}

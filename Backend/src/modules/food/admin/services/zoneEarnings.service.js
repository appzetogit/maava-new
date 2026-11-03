import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodZone } from '../models/zone.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { isPointInPolygon, normalizeZoneRing } from '../../shared/zoneServiceability.js';

export const NO_ZONE = 'none';

// razorpay_qr is collected at the door, so it counts with cash.
const ONLINE_METHODS = new Set(['razorpay', 'wallet']);
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 400;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v) => Math.round(v * 100) / 100;

/** "2026-10-01" read as that day in India, not UTC. */
const istDay = (value, endOfDay) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const d = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
};

const istDateKey = (date) =>
    new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const emptyFigures = () => ({
    orders: 0,
    gross: 0,
    itemSales: 0,
    deliveryFees: 0,
    platformFees: 0,
    packagingFees: 0,
    taxes: 0,
    discounts: 0,
    commission: 0,
    restaurantPayout: 0,
    riderPay: 0,
    adminEarning: 0,
    cashOrders: 0,
    cashGross: 0,
    onlineOrders: 0,
    onlineGross: 0,
    estimatedOrders: 0,
});

const addFigures = (into, f) => {
    for (const key of Object.keys(into)) into[key] += f[key] || 0;
};

const roundFigures = (f) => {
    const out = {};
    for (const [k, v] of Object.entries(f)) out[k] = Number.isInteger(v) ? v : round2(v);
    return out;
};

/**
 * One delivered order's money, split the way the platform settles it.
 *
 * The transaction is the source of truth: it is what the restaurant wallet and
 * the rider wallet were credited from. Orders from before transactions existed
 * fall back to the order's own pricing, with rider pay taken as the delivery
 * charge (the rule riders are paid by), and are counted as estimated.
 */
const figuresFor = (order, tx) => {
    const p = order.pricing || {};
    const a = tx?.amounts;
    const method = String(order.payment?.method || tx?.paymentMethod || 'cash');
    const online = ONLINE_METHODS.has(method);

    const gross = a ? num(a.totalCustomerPaid) : num(p.total);
    const commission = a ? num(a.restaurantCommission) : num(p.restaurantCommission);
    // Older orders never stored restaurantPayable; rebuild it the way the wallet credits it.
    const restaurantPayout = a
        ? num(a.restaurantShare)
        : num(p.restaurantPayable) || Math.max(0, num(p.subtotal) + num(p.packagingFee) - commission);
    const riderPay = a ? num(a.riderShare) : num(p.deliveryFee) + num(p.deliveryTip);
    const adminDiscount = a ? num(a.adminDiscountShare) : 0;
    const adminEarning = a
        ? num(a.platformNetProfit)
        : commission + num(p.platformFee) + num(p.deliveryFee) + num(p.deliveryTip) - riderPay - adminDiscount;

    return {
        orders: 1,
        gross,
        itemSales: num(p.subtotal),
        deliveryFees: num(p.deliveryFee),
        platformFees: num(p.platformFee),
        packagingFees: num(p.packagingFee),
        taxes: num(p.tax) + num(p.deliveryFeeGst),
        discounts: num(p.discount),
        commission,
        restaurantPayout,
        riderPay,
        adminEarning,
        cashOrders: online ? 0 : 1,
        cashGross: online ? 0 : gross,
        onlineOrders: online ? 1 : 0,
        onlineGross: online ? gross : 0,
        estimatedOrders: a ? 0 : 1,
    };
};

/** The smallest zone whose polygon holds the restaurant, as dispatch resolves it. */
const zoneForRestaurant = (restaurant, zones, zoneIds) => {
    const [lng, lat] = restaurant?.location?.coordinates || [];
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        let best = null;
        let bestSize = Infinity;
        for (const z of zones) {
            const ring = normalizeZoneRing(z.coordinates);
            if (ring.length < 3 || !isPointInPolygon(lat, lng, ring)) continue;
            const lats = ring.map((r) => r.latitude);
            const lngs = ring.map((r) => r.longitude);
            const size = (Math.max(...lats) - Math.min(...lats)) * (Math.max(...lngs) - Math.min(...lngs));
            if (size < bestSize) {
                best = String(z._id);
                bestSize = size;
            }
        }
        if (best) return best;
    }
    const stored = restaurant?.zoneId ? String(restaurant.zoneId) : null;
    return stored && zoneIds.has(stored) ? stored : NO_ZONE;
};

/**
 * Earnings of delivered orders grouped by delivery zone, for the admin panel.
 *
 * An order is placed in the zone stored on it when that zone still exists in
 * this vertical. Many older orders carry no zone, or one that has since been
 * deleted, so those fall back to the zone their restaurant sits in on the map.
 * Whatever matches neither is reported as "No zone" rather than dropped, so
 * the totals always equal every delivered order in the range.
 *
 * @param {{from?: string, to?: string, zoneId?: string, paymentMethod?: 'cash'|'online'}} query
 *        Dates are YYYY-MM-DD, read as Indian days, and filter on order date.
 */
export async function getZoneEarnings(query = {}) {
    const to = istDay(query.to, true) || new Date();
    const from = istDay(query.from, false) || new Date(to.getTime() - 29 * DAY_MS);
    if (from > to) throw new ValidationError('The start date must be on or before the end date');
    if (to - from > MAX_RANGE_DAYS * DAY_MS) {
        throw new ValidationError(`Pick a range of ${MAX_RANGE_DAYS} days or less`);
    }

    const zoneFilter = String(query.zoneId || '').trim();
    if (zoneFilter && zoneFilter !== NO_ZONE && !mongoose.Types.ObjectId.isValid(zoneFilter)) {
        throw new ValidationError('Unknown zone');
    }
    const paymentFilter = ['cash', 'online'].includes(query.paymentMethod) ? query.paymentMethod : null;

    const zones = await FoodZone.find({}).select('name zoneName isActive coordinates').lean();
    const zoneIds = new Set(zones.map((z) => String(z._id)));

    const orders = await FoodOrder.find({ orderStatus: 'delivered', createdAt: { $gte: from, $lte: to } })
        .select('order_id restaurantId zoneId pricing payment.method createdAt')
        .lean();

    const restaurantIds = [...new Set(orders.map((o) => String(o.restaurantId)))];
    const [restaurants, transactions] = await Promise.all([
        FoodRestaurant.find({ _id: { $in: restaurantIds } }).select('restaurantName location zoneId').lean(),
        FoodTransaction.find({ orderId: { $in: orders.map((o) => o._id) } }).select('orderId paymentMethod amounts').lean(),
    ]);
    const restaurantById = new Map(restaurants.map((r) => [String(r._id), r]));
    const restaurantZone = new Map(restaurants.map((r) => [String(r._id), zoneForRestaurant(r, zones, zoneIds)]));
    const txByOrder = new Map(transactions.map((t) => [String(t.orderId), t]));

    const byZone = new Map();
    const daily = new Map();
    const totals = emptyFigures();

    for (const order of orders) {
        const stored = order.zoneId ? String(order.zoneId) : null;
        const zoneKey = stored && zoneIds.has(stored) ? stored : restaurantZone.get(String(order.restaurantId)) || NO_ZONE;
        if (zoneFilter && zoneKey !== zoneFilter) continue;

        const f = figuresFor(order, txByOrder.get(String(order._id)));
        if (paymentFilter === 'cash' && !f.cashOrders) continue;
        if (paymentFilter === 'online' && !f.onlineOrders) continue;

        if (!byZone.has(zoneKey)) byZone.set(zoneKey, { figures: emptyFigures(), restaurants: new Map() });
        const zone = byZone.get(zoneKey);
        addFigures(zone.figures, f);

        const rKey = String(order.restaurantId);
        if (!zone.restaurants.has(rKey)) zone.restaurants.set(rKey, emptyFigures());
        addFigures(zone.restaurants.get(rKey), f);

        const day = istDateKey(order.createdAt);
        if (!daily.has(day)) daily.set(day, { gross: 0, adminEarning: 0, orders: 0 });
        const d = daily.get(day);
        d.gross += f.gross;
        d.adminEarning += f.adminEarning;
        d.orders += 1;

        addFigures(totals, f);
    }

    const zoneName = (key) => {
        if (key === NO_ZONE) return 'No zone';
        const z = zones.find((x) => String(x._id) === key);
        return z?.name || z?.zoneName || 'Zone';
    };

    const rows = [...byZone.entries()]
        .map(([key, z]) => ({
            zoneId: key,
            zoneName: zoneName(key),
            isActive: key === NO_ZONE ? null : zones.find((x) => String(x._id) === key)?.isActive !== false,
            ...roundFigures(z.figures),
            restaurants: [...z.restaurants.entries()]
                .map(([id, rf]) => ({
                    restaurantId: id,
                    restaurantName: restaurantById.get(id)?.restaurantName || 'Unknown',
                    ...roundFigures(rf),
                }))
                .sort((a, b) => b.gross - a.gross),
        }))
        .sort((a, b) => b.gross - a.gross);

    // Every day in the range, so a chart shows quiet days as zero.
    const series = [];
    for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
        const key = istDateKey(t);
        if (series.length && series[series.length - 1].date === key) continue;
        const d = daily.get(key) || { gross: 0, adminEarning: 0, orders: 0 };
        series.push({ date: key, gross: round2(d.gross), adminEarning: round2(d.adminEarning), orders: d.orders });
    }

    return {
        range: { from: istDateKey(from), to: istDateKey(to) },
        filters: { zoneId: zoneFilter || null, paymentMethod: paymentFilter },
        zoneOptions: [
            ...zones
                .map((z) => ({ zoneId: String(z._id), zoneName: z.name || z.zoneName || 'Zone', isActive: z.isActive !== false }))
                .sort((a, b) => a.zoneName.localeCompare(b.zoneName)),
            { zoneId: NO_ZONE, zoneName: 'No zone', isActive: null },
        ],
        totals: roundFigures(totals),
        zones: rows,
        series,
    };
}

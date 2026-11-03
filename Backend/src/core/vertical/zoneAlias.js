import mongoose from 'mongoose';
import { currentVertical } from './verticalScope.js';

/**
 * Food and Mart keep separate delivery zones, often with the same name
 * ("indore" exists once per vertical, under different ids). The customer app
 * resolves Mart's zone through Food's lookup whenever the shopper has no saved
 * address with coordinates, so most Mart requests arrived carrying a Food zone
 * id -- and a Food zone has no Mart stores, so the Mart section came up empty.
 *
 * This swaps a zone id from the other vertical for this vertical's zone of the
 * same name (case-insensitive) before the route runs. Ids already in this
 * vertical, unknown ids and names with no counterpart pass through unchanged.
 * Works for apps already installed; no release needed.
 */

const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, byId: new Map(), byVerticalName: new Map() };

async function loadZones() {
    if (Date.now() - cache.at < TTL_MS) return cache;
    // Raw collection: the model is vertical-scoped and would hide the other
    // vertical's zones, which are exactly the ones to translate.
    const zones = await mongoose.connection.db
        .collection('food_zones')
        .find({}, { projection: { name: 1, zoneName: 1, vertical: 1, isActive: 1 } })
        .toArray();
    const byId = new Map();
    const byVerticalName = new Map();
    for (const z of zones) {
        const name = String(z.name || z.zoneName || '').trim().toLowerCase();
        const vertical = z.vertical || 'food';
        byId.set(String(z._id), { vertical, name });
        const key = `${vertical}:${name}`;
        // Prefer an active zone when a name repeats within a vertical.
        if (name && (!byVerticalName.has(key) || z.isActive !== false)) byVerticalName.set(key, String(z._id));
    }
    cache = { at: Date.now(), byId, byVerticalName };
    return cache;
}

/** This vertical's id for [zoneId], or [zoneId] itself. */
export async function aliasZoneId(zoneId, vertical = currentVertical()) {
    const id = String(zoneId || '');
    if (!mongoose.Types.ObjectId.isValid(id)) return zoneId;
    const { byId, byVerticalName } = await loadZones();
    const zone = byId.get(id);
    if (!zone || zone.vertical === vertical || !zone.name) return zoneId;
    return byVerticalName.get(`${vertical}:${zone.name}`) || zoneId;
}

export const zoneAliasMiddleware = () => async (req, _res, next) => {
    try {
        if (req.query && typeof req.query.zoneId === 'string') {
            req.query.zoneId = await aliasZoneId(req.query.zoneId);
        }
        if (req.body && typeof req.body === 'object' && typeof req.body.zoneId === 'string') {
            req.body.zoneId = await aliasZoneId(req.body.zoneId);
        }
    } catch (_err) {
        // A failed lookup leaves the request exactly as sent.
    }
    next();
};

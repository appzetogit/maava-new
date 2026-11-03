import mongoose from 'mongoose';
import { FoodZone } from '../admin/models/zone.model.js';
import { getRedisClient } from '../../../config/redis.js';
import { currentVertical, VERTICALS } from '../../../core/vertical/verticalScope.js';

/**
 * Which zone a point falls in.
 *
 * Zones are stored as plain lat/lng arrays rather than GeoJSON, so Mongo cannot
 * answer this and the polygon test runs here. Lifted out of the public detect
 * controller because the answer is now needed at order time too: the client
 * detects a zone and passes the id down, and nothing ever checked that the
 * address being delivered to is actually inside it.
 *
 * ponytail: linear scan over active zones, which is fine at the scale a
 * hand-drawn zone list implies. Store zones as GeoJSON with a 2dsphere index if
 * the list ever gets long enough to matter.
 */

// Per vertical: FoodZone.find is vertical-scoped, so one shared key handed
// whichever vertical filled it first to the other -- Mart checked addresses
// against Food's zones (and the reverse) for up to two minutes at a time.
const activeZonesCacheKey = (vertical = currentVertical()) => `zones:active:list:v2:${vertical}`;
const ACTIVE_ZONES_CACHE_TTL_SECONDS = 120;

export const toFiniteNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
};

export const invalidateActiveZonesCache = async () => {
  const redis = getRedisClient();
  if (!redis || !redis.isReady) return;
  await redis.del(VERTICALS.map((v) => activeZonesCacheKey(v)));
};

export const getActiveZones = async () => {
  const redis = getRedisClient();
  if (redis?.isReady) {
    const raw = await redis.get(activeZonesCacheKey());
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fall through to a fresh read rather than failing on a poisoned key.
      }
    }
  }

  const zones = await FoodZone.find({ isActive: true }).lean();
  if (redis?.isReady) {
    await redis.set(activeZonesCacheKey(), JSON.stringify(zones), {
      EX: ACTIVE_ZONES_CACHE_TTL_SECONDS,
    });
  }
  return zones;
};

/**
 * A zone ring as `[{latitude, longitude}]`, whatever shape it was stored in.
 *
 * The schema says `[{latitude, longitude}]` and that is what the admin panel
 * saves, but `migrate-maava-legacy.js` wrote the legacy GeoJSON boundary
 * straight through — `[[[lng, lat], …]]`, a ring nested one level deep, with
 * raw driver writes that skipped schema casting. Every migrated zone therefore
 * had `coordinates.length === 1`, tripped the `< 3` guard, and was silently
 * skipped: no address matched any zone, so ordering was refused everywhere
 * with "We don't deliver to this address yet".
 *
 * Normalising on read fixes the deployed data without a migration, and keeps
 * working whichever shape a future import produces.
 */
export const normalizeZoneRing = (coordinates) => {
  if (!Array.isArray(coordinates)) return [];

  // Unwrap a GeoJSON-style ring: [[ [lng,lat], … ]] -> [ [lng,lat], … ]
  let ring = coordinates;
  if (ring.length === 1 && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) {
    ring = ring[0];
  }

  const points = [];
  for (const point of ring) {
    if (Array.isArray(point)) {
      // GeoJSON pairs are [longitude, latitude] — that order, always.
      const lng = toFiniteNumber(point[0]);
      const lat = toFiniteNumber(point[1]);
      if (lat !== null && lng !== null) points.push({ latitude: lat, longitude: lng });
      continue;
    }
    if (point && typeof point === 'object') {
      const lat = toFiniteNumber(point.latitude ?? point.lat);
      const lng = toFiniteNumber(point.longitude ?? point.lng);
      if (lat !== null && lng !== null) points.push({ latitude: lat, longitude: lng });
    }
  }
  return points;
};

/** Ray casting over a lat/lng ring. Accepts any shape [normalizeZoneRing] takes. */
export const isPointInPolygon = (lat, lng, polygon) => {
  const ring = normalizeZoneRing(polygon);
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].longitude;
    const yi = ring[i].latitude;
    const xj = ring[j].longitude;
    const yj = ring[j].latitude;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

/** The first active zone containing the point, or null. */
export const findZoneForPoint = async (lat, lng) => {
  const latitude = toFiniteNumber(lat);
  const longitude = toFiniteNumber(lng);
  if (latitude === null || longitude === null) return null;

  const zones = await getActiveZones();
  // Overlapping zones resolve to the SMALLEST one containing the point -- the
  // most specific area. First-in-the-list used to win, so a city zone drawn
  // inside a wide regional one (Bhopal inside Mart's Indore polygon) could
  // never be reached.
  let best = null;
  let bestArea = Infinity;
  for (const zone of zones) {
    // Length is checked after normalising, not before: a GeoJSON-shaped ring
    // arrives as a single nested array and would otherwise fail a raw `< 3`.
    const ring = normalizeZoneRing(zone.coordinates);
    if (ring.length < 3) continue;
    if (!isPointInPolygon(latitude, longitude, ring)) continue;
    const area = ringArea(ring);
    if (area < bestArea) {
      best = zone;
      bestArea = area;
    }
  }
  return best;
};

/** Shoelace area in squared degrees -- only ever compared, never shown. */
const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    const ax = Number(a.longitude ?? a.lng ?? a[0]);
    const ay = Number(a.latitude ?? a.lat ?? a[1]);
    const bx = Number(b.longitude ?? b.lng ?? b[0]);
    const by = Number(b.latitude ?? b.lat ?? b[1]);
    sum += (bx + ax) * (by - ay);
  }
  return Math.abs(sum / 2);
};

export const isValidZoneId = (zoneIdRaw) => {
  const trimmed = String(zoneIdRaw || '').trim();
  return trimmed !== '' && mongoose.Types.ObjectId.isValid(trimmed);
};

/**
 * A zone-scoped catalogue query that finds nothing is more likely to mean
 * "this restaurant/store has no zoneId assigned yet" than "this zone truly
 * has zero sellers" — so callers retry once unscoped rather than showing a
 * blank catalogue. `isZoneFallback` marks that retry so it can't recurse.
 */
export const shouldRetryUnscoped = ({ total, zoneIdRaw, isZoneFallback }) =>
  total === 0 && !isZoneFallback && isValidZoneId(zoneIdRaw);

/** Pulls a lat/lng off any of the address shapes in circulation. */
export const readAddressPoint = (address) => {
  if (!address || typeof address !== 'object') return null;

  const coords = address.location?.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    const lng = toFiniteNumber(coords[0]);
    const lat = toFiniteNumber(coords[1]);
    if (lat !== null && lng !== null) return { lat, lng };
  }

  const lat = toFiniteNumber(address.latitude ?? address.lat);
  const lng = toFiniteNumber(address.longitude ?? address.lng);
  if (lat !== null && lng !== null) return { lat, lng };

  return null;
};

import { FoodZone } from '../admin/models/zone.model.js';
import { getRedisClient } from '../../../config/redis.js';

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

const ACTIVE_ZONES_CACHE_KEY = 'zones:active:list:v1';
const ACTIVE_ZONES_CACHE_TTL_SECONDS = 120;

export const toFiniteNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
};

export const invalidateActiveZonesCache = async () => {
  const redis = getRedisClient();
  if (!redis || !redis.isReady) return;
  await redis.del(ACTIVE_ZONES_CACHE_KEY);
};

export const getActiveZones = async () => {
  const redis = getRedisClient();
  if (redis?.isReady) {
    const raw = await redis.get(ACTIVE_ZONES_CACHE_KEY);
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
    await redis.set(ACTIVE_ZONES_CACHE_KEY, JSON.stringify(zones), {
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
  for (const zone of zones) {
    // Length is checked after normalising, not before: a GeoJSON-shaped ring
    // arrives as a single nested array and would otherwise fail a raw `< 3`.
    const ring = normalizeZoneRing(zone.coordinates);
    if (ring.length < 3) continue;
    if (isPointInPolygon(latitude, longitude, ring)) return zone;
  }
  return null;
};

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

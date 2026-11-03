/**
 * Directions cache.
 *
 * fetchDrivingRoute is billed per call and its own header says to call it once
 * per order -- but the rider map polls /orders/:id/route continuously, so every
 * poll was a fresh Google request. These assertions pin the cache that fixes
 * that, and the properties that make it safe to leave in front of a paid API.
 *
 * Runs offline: global.fetch is stubbed and every call is counted.
 */
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'selfcheck-key';

import assert from 'node:assert/strict';

let calls = 0;
let nextStatus = 'OK';
global.fetch = async () => {
    calls += 1;
    if (nextStatus !== 'OK') {
        return { json: async () => ({ status: nextStatus, error_message: 'stub failure' }) };
    }
    return {
        json: async () => ({
            status: 'OK',
            routes: [{
                overview_polyline: { points: 'abc' },
                legs: [{
                    distance: { value: 1500 },
                    duration: { value: 300 },
                    steps: [{ polyline: { points: '_p~iF~ps|U_ulLnnqC' } }],
                }],
            }],
        }),
    };
};

const { fetchDrivingRoute } = await import('../src/modules/food/orders/utils/googleMaps.js');

const A = { lat: 22.719600, lng: 75.857700 };
const B = { lat: 22.750000, lng: 75.900000 };

// --- a repeated identical lookup is not re-billed -----------------------------
calls = 0;
const first = await fetchDrivingRoute(A, B);
const second = await fetchDrivingRoute(A, B);
assert.equal(calls, 1, 'the second identical lookup must come from cache');
assert.deepEqual(second, first, 'a cached answer must match the one it replaced');
assert.equal(first.distanceMeters, 1500);
console.log('identical lookup cached        : ok');

// --- concurrent identical lookups collapse into one request -------------------
calls = 0;
const C = { lat: 23.1, lng: 76.1 };
const together = await Promise.all([
    fetchDrivingRoute(C, B), fetchDrivingRoute(C, B), fetchDrivingRoute(C, B),
]);
assert.equal(calls, 1, 'concurrent identical lookups must share one billed call');
assert.equal(new Set(together.map((r) => r.polyline)).size, 1);
console.log('in-flight requests collapse    : ok');

// --- the DEFAULT key is precise, so priced distances are never rounded --------
// 22.7196 -> 22.7200 is ~44m. At the default precision that MUST be a new call:
// dispatch prices delivery off this distance.
calls = 0;
await fetchDrivingRoute({ lat: 22.720000, lng: 75.857700 }, B);
assert.equal(calls, 1, 'the default key must not round a 44m difference together');
console.log('default key stays precise      : ok');

// --- the display-only endpoint may opt into coarse keying --------------------
calls = 0;
const near1 = { lat: 24.100100, lng: 77.100100 };
const near2 = { lat: 24.100400, lng: 77.100400 }; // ~40m away, same 3dp cell
await fetchDrivingRoute(near1, B, { cacheKeyPrecision: 3 });
await fetchDrivingRoute(near2, B, { cacheKeyPrecision: 3 });
assert.equal(calls, 1, 'a rider drifting inside one ~111m cell must not re-bill');
console.log('coarse key shares a cell       : ok');

// --- a failure is never cached ------------------------------------------------
// Caching an outage would blank the map for the whole TTL.
nextStatus = 'ZERO_RESULTS';
calls = 0;
const D = { lat: 25.5, lng: 78.5 };
const bad = await fetchDrivingRoute(D, B);
assert.equal(bad.polyline, '', 'a failed lookup returns empty');
await fetchDrivingRoute(D, B);
assert.equal(calls, 2, 'a failure must be retried, not served from cache');
nextStatus = 'OK';
console.log('failures are not cached        : ok');

// --- recovery after a failure still caches -----------------------------------
calls = 0;
await fetchDrivingRoute(D, B);
await fetchDrivingRoute(D, B);
assert.equal(calls, 1, 'once Google answers, the answer is cached');
console.log('recovery caches normally       : ok');

// --- an expired entry is refetched -------------------------------------------
calls = 0;
const E = { lat: 26.6, lng: 79.6 };
await fetchDrivingRoute(E, B, { cacheTtlMs: 1 });
await new Promise((r) => setTimeout(r, 5));
await fetchDrivingRoute(E, B, { cacheTtlMs: 1 });
assert.equal(calls, 2, 'an expired entry must be refetched');
console.log('ttl expiry refetches           : ok');

console.log('\ndirections cache: all assertions passed');

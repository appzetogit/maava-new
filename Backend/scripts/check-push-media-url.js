// Push payloads carry media to clients that cannot resolve a relative path —
// the rider app's native order card has no API host in reach, and a relative
// `/uploads/...` made `new URL(...)` throw, leaving an empty grey thumbnail.
// Run: node scripts/check-push-media-url.js
import assert from 'node:assert/strict';
import { absoluteMediaUrl } from '../src/modules/food/orders/services/order-dispatch.service.js';
import { config } from '../src/config/env.js';

const base = config.publicMediaBaseUrl;
assert.ok(/^https?:\/\//.test(base), 'the media base must be an absolute origin');

// The case that was broken: what the DB actually stores.
assert.equal(
    absoluteMediaUrl('/uploads/food/restaurants/menu/17866.webp'),
    `${base}/uploads/food/restaurants/menu/17866.webp`,
);
// Stored without the leading slash, and never doubled up.
assert.equal(absoluteMediaUrl('uploads/x.webp'), `${base}/uploads/x.webp`);
assert.equal(absoluteMediaUrl('///uploads/x.webp'), `${base}/uploads/x.webp`);

// Already reachable — left exactly as-is. Cloudinary serves most product art.
for (const url of [
    'https://res.cloudinary.com/demo/image/upload/x.png',
    'http://example.com/x.png',
    '//cdn.example.com/x.png',
    'data:image/png;base64,iVBORw0KGgo=',
]) {
    assert.equal(absoluteMediaUrl(url), url);
}

// Nothing to show stays nothing, rather than becoming a link to the site root
// that resolves to an HTML page the decoder would choke on.
for (const empty of ['', '   ', null, undefined]) {
    assert.equal(absoluteMediaUrl(empty), '');
}

console.log('push media url checks passed');

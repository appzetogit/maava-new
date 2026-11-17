import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    ADMIN_ACCESS_KEYS,
    accessFromLegacyPermissions,
    hasAccess,
    resolveAdminApiAccess,
    sanitizeAccess,
} from './adminAccess.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Every route declared in admin.routes.js, read from the source so the test
// needs no database.
const routesSrc = fs.readFileSync(path.join(here, '../modules/food/admin/routes/admin.routes.js'), 'utf8');
const routes = [...routesSrc.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)]
    .map(([, method, p]) => ({ method: method.toUpperCase(), path: p.replace(/:[^/]+/g, 'x') }))
    .filter((r) => !r.path.endsWith('/public'));

test('every admin route belongs to a sidebar option (or is open / super-only)', () => {
    const unowned = routes.filter((r) => resolveAdminApiAccess(r.path, r.method) === null);
    assert.deepEqual(unowned.map((r) => `${r.method} ${r.path}`), []);
});

test('rule keys are real sidebar options', () => {
    for (const r of routes) {
        const keys = resolveAdminApiAccess(r.path, r.method);
        if (Array.isArray(keys)) for (const k of keys) assert.ok(ADMIN_ACCESS_KEYS.includes(k), k);
    }
});

test('frontend and backend list the same options', () => {
    const fe = fs.readFileSync(path.join(here, '../../../Frontend/src/modules/Food/utils/adminAccess.js'), 'utf8');
    const feKeys = [...fe.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(feKeys, [...ADMIN_ACCESS_KEYS].sort());
});

test('view vs edit', () => {
    const access = { orders: 'view', fee_settings: 'edit' };
    assert.equal(hasAccess(access, resolveAdminApiAccess('/orders', 'GET'), 'view'), true);
    assert.equal(hasAccess(access, resolveAdminApiAccess('/orders/x/accept', 'PATCH'), 'edit'), false);
    assert.equal(hasAccess(access, resolveAdminApiAccess('/fee-settings', 'PUT'), 'edit'), true);
    assert.equal(hasAccess(access, resolveAdminApiAccess('/delivery/wallets', 'GET'), 'view'), false);
    assert.equal(hasAccess(access, resolveAdminApiAccess('/sub-admins', 'GET'), 'view'), false);
    assert.equal(hasAccess(access, resolveAdminApiAccess('/zones', 'GET'), 'view'), true);
    assert.equal(hasAccess(access, resolveAdminApiAccess('/zones', 'POST'), 'edit'), false);
    assert.equal(hasAccess(access, resolveAdminApiAccess('/some-new-route', 'GET'), 'view'), false);
});

test('sanitize and legacy mapping', () => {
    assert.deepEqual(sanitizeAccess({ orders: 'edit', bogus: 'edit', coupons: 'delete' }), { orders: 'edit' });
    const a = accessFromLegacyPermissions({ order_management: ['view'], delivery_management: ['view', 'edit'] });
    assert.equal(a.orders, 'view');
    assert.equal(a.fee_settings, 'edit');
    assert.equal(a.coupons, undefined);
});

/**
 * applyVerticalToPath decides which backend mount every admin request lands on.
 * Getting it wrong is not a visible error -- it is an admin quietly reading or
 * writing the other vertical's data -- so the edge cases are pinned here.
 *
 * Plain node:test, no framework: this module is dependency-free by design, so
 * `node --test` runs it without a browser, a bundler or a DOM.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVerticalToPath } from './adminVertical.js';

test('food is the identity case and is never rewritten', () => {
    assert.equal(applyVerticalToPath('/food/admin/orders', 'food'), '/food/admin/orders');
});

test('quick swaps only the leading segment', () => {
    assert.equal(applyVerticalToPath('/food/admin/orders', 'quick'), '/quick/admin/orders');
    assert.equal(applyVerticalToPath('/food/hero-banners', 'quick'), '/quick/hero-banners');
});

test('a relative path keeps its shape', () => {
    assert.equal(applyVerticalToPath('food/admin/orders', 'quick'), 'quick/admin/orders');
});

test('only the FIRST segment is swapped', () => {
    // The literal "food" recurs downstream -- /food/admin/foods, an id, a query
    // value. Rewriting a later occurrence would corrupt the request rather than
    // route it, so the anchor on the regex is load-bearing.
    assert.equal(applyVerticalToPath('/food/admin/foods', 'quick'), '/quick/admin/foods');
    assert.equal(
        applyVerticalToPath('/food/admin/foods/food-123', 'quick'),
        '/quick/admin/foods/food-123',
    );
    assert.equal(
        applyVerticalToPath('/food/admin/orders?type=food', 'quick'),
        '/quick/admin/orders?type=food',
    );
});

test('paths that do not start with food are left alone', () => {
    // Auth is exempt upstream, but if it ever reaches here it must survive
    // untouched rather than be silently half-rewritten.
    assert.equal(applyVerticalToPath('/auth/admin/login', 'quick'), '/auth/admin/login');
    assert.equal(applyVerticalToPath('/uploads/image', 'quick'), '/uploads/image');
    assert.equal(applyVerticalToPath('/quick/admin/orders', 'quick'), '/quick/admin/orders');
});

test('empty and missing input do not throw', () => {
    assert.equal(applyVerticalToPath('', 'quick'), '');
    assert.equal(applyVerticalToPath(undefined, 'quick'), undefined);
    assert.equal(applyVerticalToPath(null, 'quick'), null);
});

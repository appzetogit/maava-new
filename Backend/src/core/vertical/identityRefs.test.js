/**
 * The guard that keeps IDENTITY_REFS honest.
 *
 * A field added later that holds a user, rider or admin id -- and is not added
 * to IDENTITY_REFS -- would be skipped by the merge and silently orphan those
 * documents. This test fails instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { findUncoveredPaths, auditIdentityPaths, auditSchema, stripPositional } from './identityRefs.js';

// Registers every model.
await import('../../routes/index.js');

test('every identity-shaped path in the schemas is covered by IDENTITY_REFS', () => {
    const gaps = findUncoveredPaths(mongoose);
    assert.deepEqual(
        gaps.map((g) => `${g.collection}.${g.path}`),
        [],
        'Add these to IDENTITY_REFS in identityRefs.js, or the merge will orphan them',
    );
});

test('the audit descends into subdocument schemas', () => {
    // The regression this guards: schema.eachPath() alone does NOT see inside an
    // Embedded child, which is where the rider on every order lives.
    const found = auditSchema(mongoose.model('FoodOrder').schema).map((f) => f.path);
    assert.ok(
        found.includes('dispatch.deliveryPartnerId'),
        `dispatch.deliveryPartnerId not found; got: ${found.join(', ')}`,
    );
});

test('the audit catches identity fields that declare no ref at all', () => {
    // food_user_wallets.userId has no `ref`. A ref-driven scan misses the wallet.
    const found = auditSchema(mongoose.model('FoodUserWallet').schema);
    const userId = found.find((f) => f.path === 'userId');
    assert.ok(userId, 'wallet userId must be found');
    assert.equal(userId.byRef, false, 'it is found by name, not by ref');
    assert.equal(userId.byName, true);
});

test('the audit catches a ref pointing at a model that does not exist', () => {
    // food_delivery_cash_deposits.adminId declares ref: 'User'; there is no such
    // model here (it is FoodUser), so any populate() on it is already broken.
    assert.ok(!mongoose.modelNames().includes('User'), 'no bare User model should exist');
    const found = auditSchema(mongoose.model('FoodDeliveryCashDeposit').schema);
    assert.ok(found.some((f) => f.path === 'adminId'));
});

test('stripPositional normalises array paths for comparison', () => {
    assert.equal(stripPositional('dispatch.offeredTo.$[].partnerId'), 'dispatch.offeredTo.partnerId');
    assert.equal(stripPositional('userId'), 'userId');
});

test('the audit reaches every collection that stores an identity id', () => {
    const audit = auditIdentityPaths(mongoose);
    for (const required of ['food_orders', 'food_user_wallets', 'food_delivery_wallets', 'payments']) {
        assert.ok(audit[required], `${required} must appear in the audit`);
    }
});

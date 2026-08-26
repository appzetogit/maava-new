import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    findReferrerByRef,
    generateUniqueReferralCode,
    normalizeReferralCode,
} from './referralCode.js';

/**
 * Refer & Earn never credited anyone. Two links in the chain were broken, and
 * both are covered here: the referrer lookup only accepted an ObjectId, so a
 * code a friend actually typed matched nothing; and codes were minted as raw
 * ObjectIds, which nobody reads out or types.
 */
const fakeUsers = ({ codes = new Set(), byCode = {} } = {}) => {
    const calls = { findOne: [], findById: [] };
    return {
        calls,
        exists: async (q) => (codes.has(q.referralCode) ? { _id: 'taken' } : null),
        findOne: (q) => {
            calls.findOne.push(q);
            return { select: () => ({ lean: async () => byCode[q.referralCode] ?? null }) };
        },
        findById: (id) => {
            calls.findById.push(String(id));
            return { select: () => ({ lean: async () => ({ _id: String(id) }) }) };
        },
    };
};

test('a typed referral code finds its referrer', async () => {
    const users = fakeUsers({ byCode: { ABC123: { _id: 'referrer' } } });
    assert.equal((await findReferrerByRef('ABC123', users))?._id, 'referrer');
});

test('codes match however the friend typed them', async () => {
    const users = fakeUsers({ byCode: { ABC123: { _id: 'referrer' } } });
    assert.equal((await findReferrerByRef('  abc123 ', users))?._id, 'referrer');
    assert.equal(users.calls.findOne.at(-1).referralCode, 'ABC123');
});

test('an old invite carrying the referrer id still works', async () => {
    // Links shared before short codes existed are still out there.
    const users = fakeUsers();
    const id = new mongoose.Types.ObjectId().toString();
    assert.equal((await findReferrerByRef(id, users))?._id, id);
    assert.equal(users.calls.findById.at(-1), id);
});

test('a code matching nobody credits nobody', async () => {
    const users = fakeUsers();
    assert.equal(await findReferrerByRef('NOPE99', users), null);
    assert.equal(await findReferrerByRef('', users), null);
    assert.equal(await findReferrerByRef(null, users), null);
    assert.equal(users.calls.findById.length, 0);
});

test('normalizeReferralCode is what both ends agree on', () => {
    assert.equal(normalizeReferralCode(' abc123 '), 'ABC123');
    assert.equal(normalizeReferralCode(undefined), '');
});

test('generated codes avoid the characters people mistype', async () => {
    const users = fakeUsers();
    for (let i = 0; i < 200; i += 1) {
        const code = await generateUniqueReferralCode(8, users);
        assert.equal(code.length, 6, code);
        assert.doesNotMatch(code, /[01OIL]/, code);
    }
});

test('a taken code is not handed out twice', async () => {
    // Two users sharing a code would credit the wrong person.
    const taken = new Set();
    const users = fakeUsers({ codes: taken });
    const first = await generateUniqueReferralCode(8, users);
    taken.add(first);
    for (let i = 0; i < 50; i += 1) {
        assert.notEqual(await generateUniqueReferralCode(8, users), first);
    }
});

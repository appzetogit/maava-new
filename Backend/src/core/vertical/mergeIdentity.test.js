import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizePhone,
    normalizeEmail,
    pairByKey,
    mergeWallets,
    prefixOrderId,
    planIdentityMerge,
    sumMoney,
} from './mergeIdentity.js';

test('normalizePhone collapses the formats these two databases actually hold', () => {
    for (const raw of ['+91 98765 43210', '919876543210', '9876543210', '+91-98765-43210', '098765 43210']) {
        assert.equal(normalizePhone(raw), '9876543210', `failed on ${raw}`);
    }
});

test('normalizePhone does not pad a short number into a collision', () => {
    // Padding or truncating a malformed number could make two unrelated records
    // look like the same person, which would merge two strangers' wallets.
    assert.equal(normalizePhone('12345'), '12345');
    assert.equal(normalizePhone(''), '');
    assert.equal(normalizePhone(null), '');
    assert.equal(normalizePhone('abc'), '');
});

test('wallet balances SUM -- the merge must not lose or duplicate money', () => {
    const merged = mergeWallets(
        { userId: 'u1', balance: 200, referralEarnings: 50, transactions: [] },
        { userId: 'u2', balance: 150, referralEarnings: 25, transactions: [] },
    );
    assert.equal(merged.balance, 350);
    assert.equal(merged.referralEarnings, 75);
    assert.equal(merged.userId, 'u1', 'the surviving (food) identity is kept');
});

test('mergeWallets handles a one-sided wallet', () => {
    assert.equal(mergeWallets(null, { balance: 99 }).balance, 99);
    assert.equal(mergeWallets({ balance: 12 }, null).balance, 12);
    assert.equal(mergeWallets(null, null), null);
});

test('mergeWallets treats a missing field as zero, not NaN', () => {
    // A NaN balance would be written to the database and silently break every
    // later arithmetic on that wallet.
    const merged = mergeWallets({ balance: 100 }, { balance: undefined, cashInHand: 40 });
    assert.equal(merged.balance, 100);
    assert.equal(merged.cashInHand, 40);
    assert.ok(!Number.isNaN(merged.balance));
});

test('wallet ledgers concatenate in time order', () => {
    const merged = mergeWallets(
        { transactions: [{ amount: 1, createdAt: '2026-01-03' }] },
        { transactions: [{ amount: 2, createdAt: '2026-01-01' }] },
    );
    assert.deepEqual(merged.transactions.map((t) => t.amount), [2, 1]);
});

test('order ids are prefixed, never renumbered', () => {
    assert.equal(prefixOrderId('1042', 'food'), 'FD-1042');
    assert.equal(prefixOrderId('1042', 'quick'), 'QC-1042');
});

test('prefixing is idempotent, so a resumed run cannot double-prefix', () => {
    assert.equal(prefixOrderId('FD-1042', 'food'), 'FD-1042');
    assert.equal(prefixOrderId('QC-1042', 'quick'), 'QC-1042');
    // And a mistaken second pass with the wrong vertical must not re-tag it.
    assert.equal(prefixOrderId('QC-1042', 'food'), 'QC-1042');
    assert.equal(prefixOrderId('FD-1042', 'quick'), 'FD-1042');
});

test('prefixOrderId leaves an empty id alone and rejects an unknown vertical', () => {
    assert.equal(prefixOrderId('', 'food'), '');
    assert.throws(() => prefixOrderId('1', 'grocery'), /unknown vertical/);
});

test('pairByKey separates matched, one-sided and unkeyable records', () => {
    const food = [{ _id: 'f1', phone: '9876543210' }, { _id: 'f2', phone: '9000000000' }];
    const quick = [{ _id: 'q1', phone: '+91 98765 43210' }, { _id: 'q2', phone: '' }];
    const { pairs, unkeyed } = pairByKey(food, quick, (d) => normalizePhone(d.phone));

    assert.equal(pairs.get('9876543210').food._id, 'f1');
    assert.equal(pairs.get('9876543210').quick._id, 'q1');
    assert.equal(pairs.get('9000000000').quick, null);
    assert.deepEqual(unkeyed.quick.map((d) => d._id), ['q2']);
});

test('pairByKey reports a duplicate WITHIN one database rather than merging it', () => {
    // Two food records sharing a phone is a pre-existing data problem. Silently
    // picking one would hide it at exactly the moment someone could fix it.
    const food = [{ _id: 'f1', phone: '9876543210' }, { _id: 'f2', phone: '9876543210' }];
    const { pairs } = pairByKey(food, [], (d) => normalizePhone(d.phone));
    assert.equal(pairs.get('9876543210').duplicates.length, 1);
    assert.equal(pairs.get('9876543210').duplicates[0].doc._id, 'f2');
});

test('planIdentityMerge keeps food ids stable and remaps quick onto them', () => {
    const plan = planIdentityMerge({
        foodDocs: [{ _id: 'f1', phone: '9876543210' }],
        quickDocs: [
            { _id: 'q1', phone: '919876543210' },  // same person
            { _id: 'q2', phone: '9111111111' },    // quick-only
            { _id: 'q3', phone: '' },              // unkeyable
        ],
        keyOf: (d) => normalizePhone(d.phone),
    });

    assert.equal(plan.remap.get('q1'), 'f1');
    assert.equal(plan.remap.size, 1);
    assert.deepEqual(plan.carryOver.map((d) => d._id).sort(), ['q2', 'q3']);
    assert.equal(plan.merges.length, 1);
});

test('an unkeyable quick record is carried over, never dropped', () => {
    // Dropping it would drop that person's orders with it.
    const plan = planIdentityMerge({
        foodDocs: [],
        quickDocs: [{ _id: 'q1', phone: null }],
        keyOf: (d) => normalizePhone(d.phone),
    });
    assert.deepEqual(plan.carryOver.map((d) => d._id), ['q1']);
    assert.equal(plan.remap.size, 0);
});

test('normalizeEmail is case and whitespace insensitive', () => {
    assert.equal(normalizeEmail('  Admin@Example.COM '), 'admin@example.com');
});

test('sumMoney is the headline invariant and ignores unusable values', () => {
    assert.equal(sumMoney([{ balance: 10 }, { balance: 20.5 }, { balance: null }, {}]), 30.5);
});

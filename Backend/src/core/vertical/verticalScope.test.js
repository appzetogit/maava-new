/**
 * Covers the two parts of vertical scoping that can be wrong without erroring:
 * pipeline placement (where $geoNear is the trap) and scope propagation across
 * awaits (where AsyncLocalStorage either works or silently returns undefined,
 * which reads as "no filter" and leaks the other vertical).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scopePipeline, runWithVertical, currentVertical, isVertical, VERTICALS } from './verticalScope.js';

test('scopePipeline puts $match first for an ordinary pipeline', () => {
    const pipeline = [{ $sort: { createdAt: -1 } }, { $limit: 10 }];
    scopePipeline(pipeline, 'quick');
    assert.deepEqual(pipeline[0], { $match: { vertical: 'quick' } });
    assert.equal(pipeline.length, 3);
});

test('scopePipeline never displaces $geoNear from the first stage', () => {
    // $geoNear must be stage one or MongoDB errors outright. The filter belongs
    // in its own `query`, which is what that option exists for.
    const pipeline = [
        { $geoNear: { near: { type: 'Point', coordinates: [0, 0] }, distanceField: 'd', query: { status: 'approved' } } },
        { $sort: { d: 1 } },
    ];
    scopePipeline(pipeline, 'food');

    assert.ok(pipeline[0].$geoNear, '$geoNear must still be the first stage');
    assert.deepEqual(pipeline[0].$geoNear.query, { status: 'approved', vertical: 'food' });
    assert.equal(pipeline.length, 2, 'no stage should have been added');
});

test('scopePipeline handles $geoNear with no existing query', () => {
    const pipeline = [{ $geoNear: { near: { type: 'Point', coordinates: [0, 0] }, distanceField: 'd' } }];
    scopePipeline(pipeline, 'quick');
    assert.deepEqual(pipeline[0].$geoNear.query, { vertical: 'quick' });
});

test('scopePipeline leaves the pipeline alone when there is no vertical', () => {
    const pipeline = [{ $sort: { createdAt: -1 } }];
    scopePipeline(pipeline, undefined);
    assert.deepEqual(pipeline, [{ $sort: { createdAt: -1 } }]);
});

test('the ambient vertical survives awaits and nested calls', async () => {
    const deep = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return currentVertical();
    };

    const seen = await runWithVertical('quick', async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return deep();
    });

    assert.equal(seen, 'quick');
});

test('concurrent scopes do not bleed into each other', async () => {
    // The failure this guards: one shared module-level variable instead of ALS
    // would make two in-flight requests overwrite each other's vertical.
    const slow = (vertical, ms) => runWithVertical(vertical, async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return currentVertical();
    });

    const [a, b] = await Promise.all([slow('food', 20), slow('quick', 1)]);
    assert.equal(a, 'food');
    assert.equal(b, 'quick');
});

test('isVertical rejects anything not in the enum', () => {
    assert.equal(isVertical('food'), true);
    assert.equal(isVertical('quick'), true);
    assert.equal(isVertical('FOOD'), false);
    assert.equal(isVertical(''), false);
    assert.equal(isVertical(undefined), false);
    assert.deepEqual([...VERTICALS], ['food', 'quick']);
});

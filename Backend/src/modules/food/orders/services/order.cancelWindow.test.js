import test from 'node:test';
import assert from 'node:assert/strict';

import { CANCELLATION_WINDOW_MS, isWithinCancellationWindow } from './order.service.js';

const placed = new Date('2026-08-20T17:30:00.000Z');
const at = (ms) => placed.getTime() + ms;

test('open for the whole minute, including the final second', () => {
    assert.equal(isWithinCancellationWindow(placed, at(0)), true);
    assert.equal(isWithinCancellationWindow(placed, at(59_000)), true);
    assert.equal(isWithinCancellationWindow(placed, at(CANCELLATION_WINDOW_MS)), true);
});

test('closed once the window has passed', () => {
    // The boundary is where a late request must fail closed — a request that
    // left in time but arrived at 60.001s is still refused.
    assert.equal(isWithinCancellationWindow(placed, at(CANCELLATION_WINDOW_MS + 1)), false);
    assert.equal(isWithinCancellationWindow(placed, at(5 * 60_000)), false);
});

test('an ISO string is accepted, an unusable timestamp defers to the status rule', () => {
    assert.equal(isWithinCancellationWindow(placed.toISOString(), at(10_000)), true);
    assert.equal(isWithinCancellationWindow(placed.toISOString(), at(90_000)), false);
    assert.equal(isWithinCancellationWindow(null), true);
    assert.equal(isWithinCancellationWindow(undefined), true);
});

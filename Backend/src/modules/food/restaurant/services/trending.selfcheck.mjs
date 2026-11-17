// Standalone check of the "Trending Now" sort: `sortBy=trending` validation
// and the order-count pipeline stages. The stages' correctness against real
// data (the $lookup actually counting orders) needs a database and is not
// checked here; what they are built FROM is.
//   node src/modules/food/restaurant/services/trending.selfcheck.mjs
import assert from 'node:assert';
import { parseSortBy, trendingSortStages } from './restaurant.service.js';

assert.equal(parseSortBy('trending'), 'trending', 'trending is an accepted sortBy value');
assert.equal(parseSortBy('bogus'), null, 'an unrecognised sortBy is rejected, not passed through');
assert.equal(parseSortBy(''), null, 'empty sortBy falls back to the default sort');

const [lookup, addFields, sort] = trendingSortStages();

const lookupPipeline = lookup.$lookup.pipeline;
const match = lookupPipeline[0].$match;
assert.equal(lookup.$lookup.from, 'food_orders', 'looks up the actual FoodOrder collection name');
assert.deepEqual(match.$expr, { $eq: ['$restaurantId', '$$restaurantId'] }, 'joins on this restaurant only');
assert.ok(typeof match.vertical === 'string' && match.vertical.length > 0,
    'vertical is matched explicitly -- a $lookup sub-pipeline runs outside FoodOrder.aggregate(), so ' +
    'verticalPlugin never scopes it automatically');
for (const status of ['cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin']) {
    assert.ok(match.orderStatus.$nin.includes(status), `excludes ${status} -- a cancelled order is not demand`);
}
assert.ok(match.createdAt.$gte instanceof Date, 'restricted to a trailing window, not a lifetime count');
const windowDays = (Date.now() - match.createdAt.$gte.getTime()) / (24 * 60 * 60 * 1000);
assert.ok(windowDays > 29 && windowDays < 31, `window is ~30 days, got ${windowDays.toFixed(1)}`);

assert.deepEqual(
    addFields.$addFields.orderCount,
    { $ifNull: [{ $arrayElemAt: ['$trendingStats.count', 0] }, 0] },
    'a restaurant with zero matching orders (no $lookup match) counts as 0, not missing',
);

assert.deepEqual(sort.$sort, { orderCount: -1, rating: -1, createdAt: -1 },
    'most orders first; rating then recency break ties');

console.log('trending.selfcheck.mjs: all assertions passed');

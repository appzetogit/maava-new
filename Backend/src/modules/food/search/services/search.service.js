import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import mongoose from 'mongoose';

const RESTAURANT_SEARCH_SELECT = [
    'restaurantName',
    'restaurantNameNormalized',
    'cuisines',
    'profileImage',
    'coverImages',
    'estimatedDeliveryTime',
    'estimatedDeliveryTimeMinutes',
    'offer',
    'featuredDish',
    'featuredPrice',
    'rating',
    'totalRatings',
    'isAcceptingOrders',
    'status',
    'pureVegRestaurant',
    'createdAt',
    'location',
    'zoneId',
    'area',
    'city'
].join(' ');

const FOOD_MATCH_SELECT = '_id restaurantId name image';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toFiniteNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const addDistanceScore = (restaurant, userLat, userLng) => {
    if (!restaurant?.location?.latitude || !restaurant?.location?.longitude) {
        return { ...restaurant, distanceScore: 999 };
    }

    const restaurantLat = Number(restaurant.location.latitude);
    const restaurantLng = Number(restaurant.location.longitude);
    if (!Number.isFinite(restaurantLat) || !Number.isFinite(restaurantLng)) {
        return { ...restaurant, distanceScore: 999 };
    }

    const dLat = (restaurantLat - userLat) * Math.PI / 180;
    const dLon = (restaurantLng - userLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(userLat * Math.PI / 180) * Math.cos(restaurantLat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return { ...restaurant, distanceScore: 6371 * c };
};

/**
 * Unified Search Service
 * Searches for restaurants by name and also searches for food items,
 * returning matched restaurants with potential dish highlights.
 */
export const searchUnified = async (query = {}, options = {}) => {
    const {
        q,
        lat,
        lng,
        radiusKm = 20,
        categoryId,
        minRating,
        maxDeliveryTime,
        isVeg,
        page = 1,
        limit = 20,
        zoneId,
        strictZone
    } = query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (pageNumber - 1) * limitNumber;
    const term = String(q || '').trim();
    const regex = term ? new RegExp(escapeRegex(term), 'i') : null;
    const userLat = toFiniteNumber(lat);
    const userLng = toFiniteNumber(lng);
    const hasGeoSorting = userLat !== null && userLng !== null;
    const fetchLimit = Math.min(limitNumber * 3, 120);

    // 1. Initial Filter (approved status and basic conditions)
    const restaurantFilter = { status: 'approved' };

    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
        restaurantFilter.zoneId = new mongoose.Types.ObjectId(zoneId);
    }

    if (isVeg === 'true') {
        restaurantFilter.pureVegRestaurant = true;
    }

    if (minRating) {
        restaurantFilter.rating = { $gte: parseFloat(minRating) };
    }

    if (maxDeliveryTime) {
        restaurantFilter.estimatedDeliveryTimeMinutes = { $lte: parseInt(maxDeliveryTime, 10) };
    }

    let restaurantDetailsMap = new Map();

    // 2. Handle Category Filtering (Restaurants don't have categoryId, FoodItems do)
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
        const catFoodItems = await FoodItem.find({
            categoryId: new mongoose.Types.ObjectId(categoryId),
            approvalStatus: 'approved'
        }).select('restaurantId').limit(fetchLimit * 4).lean();

        const catRestaurantIds = [...new Set(catFoodItems.map((food) => food.restaurantId.toString()))];
        if (catRestaurantIds.length > 0) {
            restaurantFilter._id = { $in: catRestaurantIds.map((id) => new mongoose.Types.ObjectId(id)) };
        } else {
            return {
                success: true,
                data: { restaurants: [], total: 0, page: pageNumber, limit: limitNumber }
            };
        }
    }

    // 3. Search Matching
    if (regex) {
        const matchedRestaurants = await FoodRestaurant.find({
            ...restaurantFilter,
            $or: [
                { restaurantName: { $regex: regex } },
                { cuisines: { $regex: regex } }
            ]
        })
            .select(RESTAURANT_SEARCH_SELECT)
            .sort({ rating: -1, createdAt: -1 })
            .limit(fetchLimit)
            .lean();

        matchedRestaurants.forEach((restaurant) => {
            restaurantDetailsMap.set(restaurant._id.toString(), { ...restaurant, matchType: 'restaurant' });
        });

        const foodFilters = { approvalStatus: 'approved' };
        if (isVeg === 'true') foodFilters.foodType = 'Veg';

        const matchedFoods = await FoodItem.find({
            ...foodFilters,
            name: { $regex: regex }
        })
            .select(FOOD_MATCH_SELECT)
            .sort({ createdAt: -1 })
            .limit(fetchLimit)
            .lean();

        const matchedFoodsByRestaurant = matchedFoods.reduce((acc, food) => {
            const restaurantId = String(food.restaurantId || '');
            if (restaurantId && !acc.has(restaurantId)) {
                acc.set(restaurantId, food);
            }
            return acc;
        }, new Map());

        const remainingIds = Array.from(matchedFoodsByRestaurant.keys()).filter((id) => !restaurantDetailsMap.has(id));
        if (remainingIds.length > 0) {
            const rsForFoods = await FoodRestaurant.find({
                ...restaurantFilter,
                _id: { $in: remainingIds.map((id) => new mongoose.Types.ObjectId(id)) }
            })
                .select(RESTAURANT_SEARCH_SELECT)
                .limit(fetchLimit)
                .lean();

            rsForFoods.forEach((restaurant) => {
                const matchedFood = matchedFoodsByRestaurant.get(restaurant._id.toString());
                restaurantDetailsMap.set(restaurant._id.toString(), {
                    ...restaurant,
                    matchType: 'food',
                    matchedDish: matchedFood?.name,
                    matchedDishImage: matchedFood?.image,
                    matchedDishId: matchedFood?._id
                });
            });
        }
    } else {
        const allMatching = await FoodRestaurant.find(restaurantFilter)
            .select(RESTAURANT_SEARCH_SELECT)
            .sort({ rating: -1, createdAt: -1 })
            .limit(fetchLimit)
            .lean();

        allMatching.forEach((restaurant) => {
            restaurantDetailsMap.set(restaurant._id.toString(), restaurant);
        });
    }

    let results = Array.from(restaurantDetailsMap.values());

    if (hasGeoSorting && results.length > 0) {
        results = results
            .map((restaurant) => addDistanceScore(restaurant, userLat, userLng))
            .sort((a, b) => (a.distanceScore || 999) - (b.distanceScore || 999));
    }

    const finalResult = {
        success: true,
        data: {
            restaurants: results.slice(skip, skip + limitNumber),
            total: results.length,
            page: pageNumber,
            limit: limitNumber,
            zoneFiltered: !!(zoneId && mongoose.Types.ObjectId.isValid(zoneId))
        }
    };

    const shouldSkipZoneFallback =
        strictZone === true ||
        strictZone === 'true' ||
        !!(categoryId && mongoose.Types.ObjectId.isValid(categoryId));

    if (
        !shouldSkipZoneFallback &&
        results.length === 0 &&
        zoneId &&
        mongoose.Types.ObjectId.isValid(zoneId)
    ) {
        const fallbackResults = await searchUnified({ ...query, zoneId: null }, options);
        if (fallbackResults.data.total > 0) {
            fallbackResults.data.wasFallback = true;
            return fallbackResults;
        }
    }

    return finalResult;
};

const PRODUCT_SEARCH_SELECT =
    '_id restaurantId name brand packSize image images price otherPrice mrp categoryId categoryName foodType rating totalRatings isAvailable stockQty maxQtyPerOrder variants';

const PRODUCT_SEARCH_PROJECTION = Object.fromEntries(
    PRODUCT_SEARCH_SELECT.split(' ').filter(Boolean).map((field) => [field, 1]),
);

/**
 * Product search: a grid of things you can buy.
 *
 * searchUnified answers a different question and still exists for the food
 * apps: it rolls dish matches up into the restaurant that sells them and always
 * returns a restaurant list. Someone shopping for groceries searches "milk" and
 * means the product, not a list of shops that stock it, so this returns items
 * and names the seller on each one.
 *
 * ponytail: regex, not a text index. It matches prefixes and mid-word, which is
 * what a shopper typing "mil" expects and what $text does not do, and the scan
 * is bounded to the sellers serving one zone. Revisit if a zone's catalog grows
 * past the point where that scan is cheap.
 */
export const searchProducts = async (query = {}) => {
    const { q, categoryId, zoneId, isVeg, inStockOnly, page = 1, limit = 20 } = query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (pageNumber - 1) * limitNumber;

    const term = String(q || '').trim();
    const regex = term ? new RegExp(escapeRegex(term), 'i') : null;

    // Only sellers that are live and serving this zone. Resolved first so the
    // product query can never surface something nobody can actually deliver --
    // the old search filtered the two queries independently, so a dish could
    // come back from a seller the zone filter had already excluded.
    const sellerFilter = { status: 'approved' };
    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
        sellerFilter.zoneId = new mongoose.Types.ObjectId(zoneId);
    }

    const sellers = await FoodRestaurant.find(sellerFilter)
        .select('restaurantName profileImage rating isAcceptingOrders estimatedDeliveryTime estimatedDeliveryTimeMinutes zoneId')
        .lean();

    if (sellers.length === 0) {
        return { products: [], total: 0, page: pageNumber, limit: limitNumber };
    }

    const sellerById = new Map(sellers.map((seller) => [String(seller._id), seller]));

    const productFilter = {
        restaurantId: { $in: sellers.map((seller) => seller._id) },
        approvalStatus: 'approved'
    };

    if (regex) {
        // Brand is searched too: "amul" is how people look for a product they
        // cannot spell the rest of.
        productFilter.$or = [{ name: { $regex: regex } }, { brand: { $regex: regex } }];
    }
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
        // A category means the whole branch, not just its own row.
        //
        // Products are assigned to whichever level the admin picked, so a
        // parent that has been subdivided held nothing of its own and its
        // screen came back empty. This matches `itemCount`, which already rolls
        // children up - the badge said "11 products" while the listing showed
        // none, which is the pair of behaviours disagreeing.
        productFilter.categoryId = { $in: await categoryBranchIds(categoryId) };
    }
    if (isVeg === 'true' || isVeg === true) {
        productFilter.foodType = 'Veg';
    }
    if (inStockOnly === 'true' || inStockOnly === true) {
        productFilter.isAvailable = { $ne: false };
    }

    // Ranked, paged and counted by the database in one pass.
    //
    // This used to read 500 documents and rank them in Node, which quietly
    // capped the catalogue: past 500 matches the rest were unreachable and
    // `total` lied about how many existed. It also shipped 500 rows to return
    // 20. A shopper on a phone pays for both.
    //
    // Out of stock sinks rather than disappearing: someone searching for
    // something we carry but cannot sell today is better told that than shown
    // an empty grid.
    const lowerTerm = term.toLowerCase();
    const scoreFor = (field) => {
        if (!lowerTerm) return 0;
        const at = { $indexOfCP: [{ $toLower: { $ifNull: [`$${field}`, ''] } }, lowerTerm] };
        return {
            $switch: {
                branches: [
                    { case: { $eq: [{ $toLower: { $ifNull: [`$${field}`, ''] } }, lowerTerm] }, then: 100 },
                    { case: { $eq: [at, 0] }, then: 50 },
                    { case: { $gt: [at, -1] }, then: 20 },
                ],
                default: 0,
            },
        };
    };

    const [agg] = await FoodItem.aggregate([
        { $match: productFilter },
        {
            $addFields: {
                _score: {
                    $add: [
                        scoreFor('name'),
                        // Brand matches rank below name matches for the same word.
                        { $multiply: [scoreFor('brand'), 0.5] },
                        { $cond: [{ $ne: ['$isAvailable', false] }, 10, 0] },
                        { $min: [{ $ifNull: ['$rating', 0] }, 5] },
                    ],
                },
            },
        },
        // _id breaks ties so paging cannot repeat or skip a row between requests.
        { $sort: { _score: -1, _id: 1 } },
        {
            $facet: {
                items: [
                    { $skip: skip },
                    { $limit: limitNumber },
                    // Derived from the same field list the find() used, so the
                    // two cannot drift and the page stays small on mobile data.
                    { $project: PRODUCT_SEARCH_PROJECTION },
                ],
                total: [{ $count: 'value' }],
            },
        },
    ]);

    const products = agg?.items || [];
    const total = agg?.total?.[0]?.value || 0;

    const pageItems = products.map((product) => {
        const seller = sellerById.get(String(product.restaurantId));
        return {
            ...product,
            inStock: product.isAvailable !== false,
            seller: seller
                ? {
                    _id: seller._id,
                    name: seller.restaurantName || '',
                    image: seller.profileImage || '',
                    rating: seller.rating || 0,
                    isAcceptingOrders: seller.isAcceptingOrders !== false,
                    estimatedDeliveryTime: seller.estimatedDeliveryTime || '',
                    estimatedDeliveryTimeMinutes: seller.estimatedDeliveryTimeMinutes ?? null
                }
                : null
        };
    });

    return {
        products: pageItems,
        total,
        page: pageNumber,
        limit: limitNumber,
        // No silent zone fallback here, unlike searchUnified. Widening the
        // search to sellers who cannot reach this address just builds a cart
        // that checkout will refuse.
        zoneFiltered: !!(zoneId && mongoose.Types.ObjectId.isValid(zoneId))
    };
};

/**
 * Fetch Admin-only categories
 */
/**
 * A category id plus every category beneath it, for filtering products by a
 * whole branch. One level of children is all the tree has today; the query is
 * written so a deeper tree would need only a loop here, not new call sites.
 */
const categoryBranchIds = async (categoryId) => {
    const root = new mongoose.Types.ObjectId(categoryId);
    const children = await FoodCategory.find({ parentId: root }).select('_id').lean();
    return [root, ...children.map((c) => c._id)];
};

export const getAdminCategories = async (query = {}) => {
    const filter = {
        isActive: true,
        isApproved: true,
        $or: [
            { restaurantId: { $exists: false } },
            { restaurantId: null },
            { restaurantId: { $eq: undefined } }
        ]
    };

    if (query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)) {
        filter.$or = [
            { zoneId: new mongoose.Types.ObjectId(query.zoneId) },
            { zoneId: { $exists: false } },
            { zoneId: null }
        ];
    }

    const categories = await FoodCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
    return attachItemCounts(categories, query.zoneId);
};

/**
 * Stamp each category with how many sellable products it actually holds.
 *
 * The apps want to show "+N more" on a category tile. Without a real number the
 * only options are inventing one or dropping the badge, so the count comes from
 * the catalogue itself.
 *
 * A parent's count INCLUDES its children's: products are assigned to whichever
 * level the admin picked, and a shopper reading "Vegetables & Fruits" means the
 * whole branch. Counting only direct hits made freshly-subdivided categories
 * read as empty.
 *
 * One aggregation for every category rather than a query each — this endpoint
 * returns ~160 rows, and it is cached for 30 minutes on top.
 */
const attachItemCounts = async (categories, zoneId) => {
    if (!categories.length) return categories;

    // Exactly what the product listing can show: approved items belonging to an
    // approved seller. Counting every FoodItem regardless of its seller made
    // the badge claim more than the category could ever display -- 'Fruits &
    // Vegetables' advertised 11 while the listing had 5.
    // Same seller set the product listing uses, INCLUDING its zone filter --
    // a shopper in Hyderabad must not see an Indore category's stock counted.
    const sellerFilter = { status: 'approved' };
    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
        sellerFilter.zoneId = new mongoose.Types.ObjectId(zoneId);
    }
    const sellers = await FoodRestaurant.find(sellerFilter).select('_id').lean();
    if (!sellers.length) return categories.map((c) => ({ ...c, itemCount: 0 }));

    const rows = await FoodItem.aggregate([
        {
            $match: {
                categoryId: { $in: categories.map((c) => c._id) },
                restaurantId: { $in: sellers.map((s) => s._id) },
                approvalStatus: 'approved'
            }
        },
        { $group: { _id: '$categoryId', count: { $sum: 1 } } }
    ]);

    const direct = new Map(rows.map((r) => [String(r._id), r.count]));
    const childrenOf = new Map();
    for (const cat of categories) {
        if (!cat.parentId) continue;
        const key = String(cat.parentId);
        childrenOf.set(key, [...(childrenOf.get(key) || []), String(cat._id)]);
    }

    return categories.map((cat) => {
        const id = String(cat._id);
        const own = direct.get(id) || 0;
        const fromChildren = (childrenOf.get(id) || []).reduce(
            (sum, childId) => sum + (direct.get(childId) || 0),
            0
        );
        return { ...cat, itemCount: own + fromChildren };
    });
};

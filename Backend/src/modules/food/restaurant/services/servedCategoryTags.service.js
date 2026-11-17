import { FoodCategory } from '../../admin/models/category.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { logger } from '../../../../utils/logger.js';

/**
 * The home screen's food tiles (Idli, Dosa, Biryani...) are the admin's global
 * categories. Tapping one filters restaurants by matching the tile's name
 * against each restaurant's cuisines -- but restaurants file their dishes
 * under their own categories and spellings ("Idly", "Breakfast", "Tiffins"),
 * so a restaurant serving fourteen kinds of idli did not show under "Idli".
 *
 * Here each restaurant gets the names of the tiles its approved dishes
 * actually match, added after its own cuisines in the list response: the app
 * needs no update, the card reads "South Indian • Idli • Dosa", and nothing is
 * written to the database.
 */

const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, byRestaurant: new Map() };

// Spelling-tolerant words: "Idly"/"Idli"/"Idlis" -> "idli", "Biryanis" -> "biryani".
const normWord = (w) => w.replace(/(ies|s)$/, (m) => (m === 'ies' ? 'y' : '')).replace(/y$/, 'i');
const words = (text) =>
    String(text || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 1)
        .map(normWord);

async function build() {
    const tiles = await FoodCategory.find({
        $or: [{ restaurantId: null }, { restaurantId: { $exists: false } }],
        isActive: { $ne: false },
        approvalStatus: { $nin: ['rejected', 'pending'] },
        vertical: { $ne: 'quick' },
    })
        .select('name')
        .lean();
    const matchers = tiles
        .map((t) => ({ name: String(t.name || '').trim(), need: words(t.name) }))
        .filter((t) => t.name && t.need.length);

    const items = await FoodItem.find({ approvalStatus: 'approved' })
        .select('restaurantId name categoryName')
        .lean();

    const byRestaurant = new Map();
    for (const item of items) {
        const rid = String(item.restaurantId || '');
        if (!rid) continue;
        const have = new Set([...words(item.name), ...words(item.categoryName)]);
        for (const m of matchers) {
            if (m.need.every((w) => have.has(w))) {
                if (!byRestaurant.has(rid)) byRestaurant.set(rid, new Set());
                byRestaurant.get(rid).add(m.name);
            }
        }
    }
    return byRestaurant;
}

async function servedTilesByRestaurant() {
    if (Date.now() - cache.at < CACHE_MS) return cache.byRestaurant;
    try {
        cache = { at: Date.now(), byRestaurant: await build() };
    } catch (err) {
        logger.warn(`servedCategoryTags: could not build (${err?.message || err})`);
    }
    return cache.byRestaurant;
}

/** Adds served tile names to each food restaurant's cuisines, after its own, without repeats. */
export async function addServedCategoryTags(restaurants = []) {
    if (!Array.isArray(restaurants) || restaurants.length === 0) return restaurants;
    const byRestaurant = await servedTilesByRestaurant();
    return restaurants.map((r) => {
        if (!r || r.vertical === 'quick') return r;
        const served = byRestaurant.get(String(r._id || r.id || r.restaurantId || ''));
        if (!served || served.size === 0) return r;
        const own = Array.isArray(r.cuisines) ? r.cuisines.filter(Boolean) : [];
        // Compared by their spelling-tolerant words, so "pizza" after "Pizza"
        // or "Burger" after "Burgers" is not added a second time.
        const key = (c) => words(c).join(' ');
        const seen = new Set(own.map(key));
        const added = [];
        for (const name of served) {
            const k = key(name);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            // Tiles typed in lowercase ("pizza") read as titles on the card.
            added.push(name.replace(/\b[a-z]/g, (ch) => ch.toUpperCase()));
        }
        return added.length ? { ...r, cuisines: [...own, ...added] } : r;
    });
}

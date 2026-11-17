import { getAdminVertical } from "./adminVertical";

/**
 * Per-vertical wording and visibility for the admin sidebar.
 *
 * There is ONE menu definition shared by both verticals, which is deliberate --
 * the two panels drive the same ~170 routes and forking the menu would mean
 * every future entry had to be added twice. What differs is only the wording and
 * a couple of sections that genuinely do not apply.
 *
 * The menu is authored in quick-commerce wording ("Sellers", "Products"), since
 * that is how the quick-commerce fork renamed it. Food gets the restaurant
 * wording back through the map below, so an admin looking at the food catalogue
 * sees "Restaurants" and "Foods" rather than "Sellers" and "Products".
 *
 * A rename map rather than two menu files: adding an entry still means touching
 * one place, and an entry nobody renames simply keeps its generic label instead
 * of disappearing from one panel.
 */

const FOOD_LABELS = {
    // Sections
    'CATALOG MANAGEMENT': 'MENU MANAGEMENT',
    'SELLER MANAGEMENT': 'RESTAURANT MANAGEMENT',

    // Catalogue
    'Product Approval': 'Food Approval',
    Products: 'Foods',
    'Seller Products List': 'Restaurant Foods List',
    'Seller Add-ons List': 'Restaurant Add-ons List',

    // Sellers
    Sellers: 'Restaurants',
    'Sellers List': 'Restaurants List',
    'New Seller Requests': 'New Restaurant Requests',
    'Unregistered Sellers': 'Unregistered Restaurants',
    'Seller Reviews': 'Restaurant Reviews',
    'Seller Complaints': 'Restaurant Complaints',
    'Seller Settings': 'Restaurant Settings',
    'Seller Wallet': 'Restaurant Wallet',
    'Seller Withdraws': 'Restaurant Withdraws',
    'Seller Report': 'Restaurant Report',
    'Seller Commission': 'Restaurant Commission',
};

/** quick keeps the menu exactly as authored, so it needs no overrides. */
const LABELS = { food: FOOD_LABELS, quick: {} };

export const verticalLabel = (label, vertical) => {
    const map = LABELS[vertical];
    if (!map) return label;
    return map[String(label)] || label;
};

/**
 * Page-body vocabulary, for headings and counts inside a page.
 *
 * Separate from `verticalLabel` because it maps the other way. The sidebar menu
 * is authored in quick-commerce wording and renamed for food; the pages were
 * written for the food app and say "Restaurants List" everywhere, so they need
 * renaming for quick instead. Feeding page strings through the sidebar map
 * would leave them untouched, which is exactly the mismatch this fixes: the
 * sidebar said "Sellers" while the page it opened said "Restaurants List".
 *
 * Nouns rather than whole sentences, so a page composes its own wording and one
 * entry serves every heading, empty state and count that mentions the thing.
 */
const NOUNS = {
    food: {
        One: 'Restaurant', Many: 'Restaurants', one: 'restaurant', many: 'restaurants',
        ItemOne: 'Food', ItemMany: 'Foods', itemOne: 'food', itemMany: 'foods',
    },
    quick: {
        One: 'Seller', Many: 'Sellers', one: 'seller', many: 'sellers',
        ItemOne: 'Product', ItemMany: 'Products', itemOne: 'product', itemMany: 'products',
    },
};

/** Falls back to food wording, matching config.defaultVertical on the server. */
export const verticalNouns = (vertical) => NOUNS[vertical] || NOUNS.food;

/**
 * Whole-string version of the nouns above, for page text written in
 * quick-commerce wording: "Seller Commission" stays as is for quick and reads
 * "Restaurant Commission" for food. Pass only fixed copy -- never a seller's
 * name or other data, which would get renamed too. Switching vertical reloads
 * the page, so reading the vertical at call time is enough.
 */
const FOOD_WORDING = [
    [/\bSELLERS\b/g, 'RESTAURANTS'], [/\bSELLER\b/g, 'RESTAURANT'],
    [/\bSellers\b/g, 'Restaurants'], [/\bSeller\b/g, 'Restaurant'],
    [/\bsellers\b/g, 'restaurants'], [/\bseller\b/g, 'restaurant'],
    [/\bPRODUCTS\b/g, 'FOODS'], [/\bPRODUCT\b/g, 'FOOD'],
    [/\bProducts\b/g, 'Foods'], [/\bProduct\b/g, 'Food'],
    [/\bproducts\b/g, 'foods'], [/\bproduct\b/g, 'food'],
];

export const vt = (text, vertical = getAdminVertical()) => {
    if (vertical !== 'food' || typeof text !== 'string') return text;
    return FOOD_WORDING.reduce((out, [pattern, word]) => out.replace(pattern, word), text);
};

/**
 * Sections that exist for one vertical only.
 *
 * Dining is a restaurant concept -- a grocery store has no tables. Anything not
 * listed here shows in both, which is the safe default: a new section appears
 * everywhere until someone decides otherwise, rather than silently vanishing.
 */
const SECTION_VERTICALS = {
    'DINING MANAGEMENT': ['food'],
};

export const isSectionVisibleForVertical = (sectionLabel, vertical) => {
    const allowed = SECTION_VERTICALS[String(sectionLabel)];
    return !allowed || allowed.includes(vertical);
};

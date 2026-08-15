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
};

/** quick keeps the menu exactly as authored, so it needs no overrides. */
const LABELS = { food: FOOD_LABELS, quick: {} };

export const verticalLabel = (label, vertical) => {
    const map = LABELS[vertical];
    if (!map) return label;
    return map[String(label)] || label;
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

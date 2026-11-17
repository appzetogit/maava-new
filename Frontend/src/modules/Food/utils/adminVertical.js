/**
 * Which vertical the admin panel is currently looking at.
 *
 * One admin session spans both verticals -- the same person approves a
 * restaurant in the morning and a grocery store in the afternoon -- so unlike
 * the seller and customer apps, the vertical cannot come from the login. It is
 * a UI selection, held here.
 *
 * It is deliberately NOT part of the admin URL. The route table lives under
 * /admin/store/* in 150 route declarations and roughly 200 string literals
 * across sidebar, RBAC and page links; threading a vertical segment through all
 * of those would be a large mechanical edit with no compiler to catch a missed
 * one. Keeping it out of the URL also means a bookmarked admin page works in
 * whichever vertical the admin has selected, rather than pinning them to the one
 * that happened to be active when they saved it.
 *
 * The wire request carries it instead: the API client rewrites the /food/
 * prefix to /quick/ on admin calls, hitting the same route table the backend
 * already mounts at both prefixes.
 */

export const ADMIN_VERTICALS = Object.freeze([
    { value: 'food', label: 'Food Delivery', short: 'Food' },
    { value: 'quick', label: 'Quick Commerce', short: 'Quick' },
]);

const STORAGE_KEY = 'admin_vertical';
const DEFAULT_VERTICAL = 'food';

const isValid = (value) => ADMIN_VERTICALS.some((entry) => entry.value === value);

export const getAdminVertical = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return isValid(stored) ? stored : DEFAULT_VERTICAL;
    } catch {
        // Private-mode Safari and some embedded webviews throw on localStorage.
        // Defaulting to food keeps the panel usable rather than blank.
        return DEFAULT_VERTICAL;
    }
};

export const setAdminVertical = (value) => {
    if (!isValid(value)) return getAdminVertical();
    try {
        localStorage.setItem(STORAGE_KEY, value);
    } catch {
        /* see getAdminVertical */
    }
    return value;
};

export const getAdminVerticalLabel = (value = getAdminVertical()) =>
    ADMIN_VERTICALS.find((entry) => entry.value === value)?.label || value;

/**
 * Rewrite an admin API path onto the selected vertical's mount.
 *
 * `/food/...` is the canonical form everywhere in this codebase -- the RBAC
 * path map, the permission checks and every service call are written against
 * it -- so the swap happens once, last, on the way out. Anything not starting
 * with /food/ is returned untouched.
 */
export const applyVerticalToPath = (url, vertical = getAdminVertical()) => {
    if (vertical === 'food' || !url) return url;
    return String(url).replace(/^(\/?)food\//, `$1${vertical}/`);
};

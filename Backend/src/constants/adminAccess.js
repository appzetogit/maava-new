/**
 * What a sub-admin can be given, one entry per sidebar option.
 *
 * Access is stored per key as 'view' or 'edit' (edit includes view). Super
 * admins skip all of this. The frontend keeps the same keys in
 * Frontend/src/modules/Food/utils/adminAccess.js (pages and sidebar); this file
 * owns the API side. adminAccess.test.js fails if the two key lists drift.
 */

export const ACCESS_LEVELS = ['view', 'edit'];

export const ADMIN_ACCESS_GROUPS = [
    { group: 'General', items: [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'point_of_sale', label: 'Point of Sale' },
        { key: 'restaurant_commission', label: 'Restaurant Commission' },
    ] },
    { group: 'Catalog', items: [
        { key: 'product_approval', label: 'Product Approval' },
        { key: 'products', label: 'Products & Add-ons' },
        { key: 'categories', label: 'Categories' },
    ] },
    { group: 'Sellers', items: [
        { key: 'zone_setup', label: 'Zone Setup' },
        { key: 'sellers', label: 'Sellers' },
    ] },
    { group: 'Orders', items: [
        { key: 'orders', label: 'Orders' },
        { key: 'order_detect_delivery', label: 'Order Detect Delivery' },
    ] },
    { group: 'Promotions & Rewards', items: [
        { key: 'coupons', label: 'Coupons & Offers' },
        { key: 'referral_settings', label: 'Referral Settings' },
    ] },
    { group: 'Customers', items: [
        { key: 'customers', label: 'Customers' },
        { key: 'cod_access', label: 'COD Access' },
        { key: 'support_tickets', label: 'Support Tickets (User & Seller)' },
    ] },
    { group: 'Delivery', items: [
        { key: 'fee_settings', label: 'Delivery & Platform Fee' },
        { key: 'delivery_withdrawal', label: 'Delivery Withdrawal' },
        { key: 'delivery_wallet', label: 'Delivery Boy Wallet' },
        { key: 'delivery_cash_limit', label: 'Delivery Cash Limit' },
        { key: 'cash_settlement', label: 'Cash Limit Settlement' },
        { key: 'delivery_emergency', label: 'Delivery Emergency Help' },
        { key: 'delivery_support', label: 'Delivery Support Tickets' },
        { key: 'order_reassignment', label: 'Order Reassignment Requests' },
        { key: 'deliverymen', label: 'Deliveryman (list, join requests, bonus, earnings)' },
    ] },
    { group: 'Help & Support', items: [
        { key: 'user_feedback', label: 'User Feedback' },
        { key: 'safety_reports', label: 'Safety Emergency Reports' },
    ] },
    { group: 'Reports', items: [
        { key: 'transaction_report', label: 'Transaction Report' },
        { key: 'order_report', label: 'Order Report' },
        { key: 'tax_report', label: 'Tax Report' },
        { key: 'restaurant_report', label: 'Restaurant Report' },
        { key: 'customer_report', label: 'Customer Report' },
        { key: 'restaurant_withdraws', label: 'Restaurant Withdraws' },
    ] },
    { group: 'Banners & Pages', items: [
        { key: 'landing_page', label: 'Landing Page Management' },
        { key: 'promotional_banners', label: 'Promotional Banners' },
        { key: 'mart_themes', label: 'Housefull Sale (Mart)' },
        { key: 'pages', label: 'Pages & Social Media' },
    ] },
    { group: 'System', items: [
        { key: 'broadcast', label: 'Broadcast Notification' },
        { key: 'business_setup', label: 'Business Setup' },
        { key: 'feature_settings', label: 'Feature Settings' },
        { key: 'power_scanning', label: 'Power Scanning' },
    ] },
];

export const ADMIN_ACCESS_KEYS = ADMIN_ACCESS_GROUPS.flatMap((g) => g.items.map((i) => i.key));
const KEY_SET = new Set(ADMIN_ACCESS_KEYS);

/**
 * Admin API path (relative to /admin) -> the sidebar options that use it.
 * First match wins. A sub-admin needs view on ANY listed key for GET, and edit
 * on any of them for everything else.
 *
 *   keys: 'open'       any active admin (lookups most pages need)
 *   keys: 'super'      super admins only
 *   no match           refused for sub-admins
 */
const RULES = [
    // Admin management: super admins only.
    [/^\/sub-admins/, 'super'],

    // Lookups many pages read (zone and restaurant pickers, badges, search).
    [/^\/(sidebar-badges|global-search)/, 'open', 'GET'],
    [/^\/zones(\/[^/]+)?$/, 'open', 'GET'],
    [/^\/restaurants(\/[^/]+)?$/, 'open', 'GET'],
    [/^\/categories/, 'open', 'GET'],
    [/^\/(business-settings|feature-settings)/, 'open', 'GET'],

    [/^\/dashboard-stats/, ['dashboard']],
    [/^\/restaurant-commissions/, ['restaurant_commission']],

    [/^\/foods\/(pending-approvals|[^/]+\/(approve|reject)|bulk-approve)/, ['product_approval']],
    [/^\/(foods|addons)/, ['products', 'product_approval', 'point_of_sale']],
    [/^\/categories/, ['categories']],

    [/^\/zones/, ['zone_setup']],
    [/^\/(restaurants|restaurant-settings|restaurant-subscription-settings|restaurant-subscriptions|restaurant-app-banners|dining)/, ['sellers']],

    [/^\/order-detect-delivery/, ['order_detect_delivery']],
    [/^\/orders/, ['orders', 'point_of_sale']],

    [/^\/offers/, ['coupons']],
    [/^\/(referral-settings|cashback-settings)/, ['referral_settings']],

    [/^\/customers\/[^/]+\/cod/, ['cod_access']],
    [/^\/customers/, ['customers', 'cod_access', 'customer_report']],
    [/^\/support-tickets/, ['support_tickets']],

    [/^\/fee-settings/, ['fee_settings']],
    [/^\/delivery\/withdrawals/, ['delivery_withdrawal']],
    [/^\/delivery\/wallets/, ['delivery_wallet', 'deliverymen']],
    [/^\/delivery-cash-limit/, ['delivery_cash_limit']],
    [/^\/delivery\/cash-limit-settlements|^\/delivery\/cash-settlements/, ['cash_settlement']],
    [/^\/delivery-emergency-help/, ['delivery_emergency']],
    [/^\/delivery\/support-tickets/, ['delivery_support']],
    [/^\/delivery\/order-emergency-requests/, ['order_reassignment']],
    [/^\/(delivery|driver-registration-fields)/, ['deliverymen']],

    [/^\/contact-messages/, ['user_feedback']],
    [/^\/safety-emergency-reports/, ['safety_reports']],

    [/^\/reports\/transactions/, ['transaction_report']],
    [/^\/reports\/tax/, ['tax_report']],
    [/^\/reports\/restaurants/, ['restaurant_report']],
    [/^\/reports\/orders/, ['order_report']],
    [/^\/reports/, ['transaction_report', 'order_report', 'tax_report', 'restaurant_report', 'customer_report']],
    [/^\/feedback-experiences/, ['customer_report']],
    [/^\/withdrawals/, ['restaurant_withdraws']],

    [/^\/pages-social-media/, ['pages']],
    [/^\/notifications/, ['broadcast']],
    [/^\/business-settings/, ['business_setup']],
    [/^\/feature-settings/, ['feature_settings']],
    [/^\/power-scanning/, ['power_scanning']],
];

/** Landing routes (mounted outside /admin) that only admins may use. */
const LANDING_RULES = [
    [/^\/hero-banners\/landing/, ['landing_page']],
    [/^\/(hero-banners|top-banners)/, ['landing_page', 'promotional_banners']],
    [/^\/mart-sale-campaigns/, ['mart_themes']],
];

function match(rules, path, method) {
    const m = String(method || 'GET').toUpperCase();
    for (const [re, keys, onlyMethod] of rules) {
        if (onlyMethod && onlyMethod !== m) continue;
        if (re.test(path)) return keys;
    }
    return null;
}

export const resolveAdminApiAccess = (path, method) => match(RULES, path, method);
export const resolveLandingApiAccess = (path, method) => match(LANDING_RULES, path, method);

export const isSuperAdmin = (admin) =>
    !admin?.adminType || admin.adminType === 'super_admin' || admin.isSuperAdmin === true;

/** The level ('view' | 'edit') a request needs. */
export const levelForMethod = (method) => (String(method || 'GET').toUpperCase() === 'GET' ? 'view' : 'edit');

/** Can this (non-super) admin do [level] on any of [keys]? */
export function hasAccess(access, keys, level) {
    if (keys === 'open') return true;
    if (keys === 'super' || !Array.isArray(keys)) return false;
    return keys.some((key) => {
        const granted = access?.[key];
        return granted === 'edit' || (level === 'view' && granted === 'view');
    });
}

/** Keep only known keys and levels. */
export function sanitizeAccess(raw = {}) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [key, level] of Object.entries(raw)) {
        if (KEY_SET.has(key) && ACCESS_LEVELS.includes(level)) out[key] = level;
    }
    return out;
}

/** Everything, at edit: what the apps are told a super admin has. */
export const FULL_ACCESS = Object.freeze(Object.fromEntries(ADMIN_ACCESS_KEYS.map((k) => [k, 'edit'])));

/** Old section permissions -> the sidebar options they covered. */
export const LEGACY_SECTION_TO_KEYS = {
    dashboard: ['dashboard'],
    point_of_sale: ['point_of_sale'],
    food_management: ['product_approval', 'products', 'categories'],
    restaurant_management: ['zone_setup', 'sellers', 'restaurant_commission'],
    order_management: ['orders', 'order_detect_delivery'],
    promotions_management: ['coupons'],
    referral_rewards: ['referral_settings'],
    customer_management: ['customers', 'cod_access', 'support_tickets'],
    delivery_management: ['fee_settings', 'delivery_withdrawal', 'delivery_wallet', 'delivery_cash_limit',
        'cash_settlement', 'delivery_emergency', 'delivery_support', 'order_reassignment', 'deliverymen'],
    support_management: ['user_feedback', 'safety_reports'],
    report_management: ['transaction_report', 'order_report', 'tax_report', 'restaurant_report', 'customer_report'],
    transaction_management: ['restaurant_withdraws'],
    banner_management: ['landing_page', 'promotional_banners', 'mart_themes'],
    pages_social_media: ['pages'],
};

export function accessFromLegacyPermissions(permissions = {}) {
    const out = {};
    for (const [section, actions] of Object.entries(permissions || {})) {
        if (!Array.isArray(actions) || actions.length === 0) continue;
        const level = actions.some((a) => a !== 'view') ? 'edit' : 'view';
        for (const key of LEGACY_SECTION_TO_KEYS[section] || []) {
            if (out[key] !== 'edit') out[key] = level;
        }
    }
    return out;
}

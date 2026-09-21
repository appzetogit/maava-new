/**
 * Sidebar options a sub-admin can be given, and the admin pages each one owns.
 * Same keys as Backend/src/constants/adminAccess.js (a backend test checks).
 * Access per key is "view" or "edit"; edit includes view.
 */

export const ADMIN_ACCESS_GROUPS = [
  { group: "General", items: [
    { key: "dashboard", label: "Dashboard", pages: ["=/admin/store"] },
    { key: "point_of_sale", label: "Point of Sale", pages: ["/admin/store/point-of-sale"] },
    { key: "restaurant_commission", label: "Restaurant Commission", pages: ["/admin/store/sellers/commission"] },
  ] },
  { group: "Catalog", items: [
    { key: "product_approval", label: "Product Approval", pages: ["/admin/store/food-approval"] },
    { key: "products", label: "Products & Add-ons", pages: ["/admin/store/products", "/admin/store/addons", "/admin/store/foods"] },
    { key: "categories", label: "Categories", pages: ["/admin/store/categories"] },
  ] },
  { group: "Sellers", items: [
    { key: "zone_setup", label: "Zone Setup", pages: ["/admin/store/zone-setup"] },
    { key: "sellers", label: "Sellers", pages: ["/admin/store/sellers", "/admin/store/restaurants"] },
  ] },
  { group: "Orders", items: [
    { key: "orders", label: "Orders", pages: ["/admin/store/orders"] },
    { key: "order_detect_delivery", label: "Order Detect Delivery", pages: ["/admin/store/order-detect-delivery"] },
  ] },
  { group: "Promotions & Rewards", items: [
    { key: "coupons", label: "Coupons & Offers", pages: ["/admin/store/coupons"] },
    { key: "referral_settings", label: "Referral Settings", pages: ["/admin/store/referral-settings"] },
  ] },
  { group: "Customers", items: [
    { key: "customers", label: "Customers", pages: ["/admin/store/customers"] },
    { key: "cod_access", label: "COD Access", pages: ["/admin/store/cod-access"] },
    { key: "support_tickets", label: "Support Tickets (User & Seller)", pages: ["/admin/store/support-tickets"] },
  ] },
  { group: "Delivery", items: [
    { key: "fee_settings", label: "Delivery & Platform Fee", pages: ["/admin/store/fee-settings"] },
    { key: "delivery_withdrawal", label: "Delivery Withdrawal", pages: ["/admin/store/delivery-withdrawal"] },
    { key: "delivery_wallet", label: "Delivery Boy Wallet", pages: ["/admin/store/delivery-boy-wallet"] },
    { key: "delivery_cash_limit", label: "Delivery Cash Limit", pages: ["/admin/store/delivery-cash-limit"] },
    { key: "cash_settlement", label: "Cash Limit Settlement", pages: ["/admin/store/cash-limit-settlement"] },
    { key: "delivery_emergency", label: "Delivery Emergency Help", pages: ["/admin/store/delivery-emergency-help"] },
    { key: "delivery_support", label: "Delivery Support Tickets", pages: ["/admin/store/delivery-support-tickets"] },
    { key: "order_reassignment", label: "Order Reassignment Requests", pages: ["/admin/store/delivery-order-reassignment-requests"] },
    { key: "deliverymen", label: "Deliveryman (list, join requests, bonus, earnings)", pages: ["/admin/store/delivery-partners", "/admin/store/delivery"] },
  ] },
  { group: "Help & Support", items: [
    { key: "user_feedback", label: "User Feedback", pages: ["/admin/store/contact-messages"] },
    { key: "safety_reports", label: "Safety Emergency Reports", pages: ["/admin/store/safety-emergency-reports"] },
  ] },
  { group: "Reports", items: [
    { key: "transaction_report", label: "Transaction Report", pages: ["/admin/store/transaction-report"] },
    { key: "order_report", label: "Order Report", pages: ["/admin/store/order-report"] },
    { key: "tax_report", label: "Tax Report", pages: ["/admin/store/tax-report"] },
    { key: "restaurant_report", label: "Restaurant Report", pages: ["/admin/store/restaurant-report"] },
    { key: "customer_report", label: "Customer Report", pages: ["/admin/store/customer-report"] },
    { key: "restaurant_withdraws", label: "Restaurant Withdraws", pages: ["/admin/store/restaurant-withdraws"] },
  ] },
  { group: "Banners & Pages", items: [
    { key: "landing_page", label: "Landing Page Management", pages: ["/admin/store/hero-banner-management"] },
    { key: "promotional_banners", label: "Promotional Banners", pages: ["/admin/store/promotional-banner", "/admin/store/banners"] },
    { key: "mart_themes", label: "Housefull Sale (Mart)", pages: ["/admin/store/mart-category-themes"] },
    { key: "pages", label: "Pages & Social Media", pages: ["/admin/store/pages-social-media"] },
  ] },
  { group: "System", items: [
    { key: "broadcast", label: "Broadcast Notification", pages: ["/admin/store/broadcast-notification"] },
    { key: "business_setup", label: "Business Setup", pages: ["/admin/store/business-setup"] },
    { key: "feature_settings", label: "Feature Settings", pages: ["/admin/store/feature-settings"] },
    { key: "power_scanning", label: "Power Scanning", pages: ["/admin/store/power-scanning"] },
  ] },
]

/** Pages only super admins open. */
export const SUPER_ADMIN_PAGES = ["/admin/store/employees", "/admin/store/employee-role"]

/** Pages every admin may open. */
export const ALWAYS_OPEN_PAGES = ["/admin/store/profile", "/admin/store/settings"]

// Longest prefix first, so /sellers/commission wins over /sellers.
const PAGE_RULES = ADMIN_ACCESS_GROUPS.flatMap((g) =>
  g.items.flatMap((item) =>
    item.pages.map((p) => ({ exact: p.startsWith("="), prefix: p.replace(/^=/, ""), key: item.key }))
  )
).sort((a, b) => b.prefix.length - a.prefix.length)

const trimPath = (p) => String(p || "").replace(/\/+$/, "") || "/"

/** The option that owns an admin page, "super", "open", or null. */
export function accessKeyForPath(pathname) {
  const path = trimPath(pathname)
  if (SUPER_ADMIN_PAGES.some((p) => path === p || path.startsWith(p + "/"))) return "super"
  if (ALWAYS_OPEN_PAGES.includes(path)) return "open"
  const rule = PAGE_RULES.find((r) =>
    r.exact ? path === r.prefix : path === r.prefix || path.startsWith(r.prefix + "/") || path.startsWith(r.prefix + "?")
  )
  return rule ? rule.key : null
}

import { Navigate, useLocation, useParams } from "react-router-dom"

/**
 * The app's own paths, pointed at the website's screens.
 *
 * Links shared from the app, notification deep links and old bookmarks use the
 * Flutter route names (/orders/track/:id, /quick/product/:id ...). None of them
 * resolved on the website before, so each landed on a blank page. Every entry
 * points at the closest screen the website has today; entries marked
 * "until Phase 5" move to their real screen when it is built.
 */
export const APP_ROUTE_ALIASES = [
  // Food (presentation/navigation/route_names.dart)
  ["home", ""],
  ["home-filter", ""],
  ["store-99", "under-250"], // until Phase 5 builds the 99 Store
  ["buy-again", "orders"],
  ["all-offers", "offers"],
  ["favorites", "profile/favorites"],
  ["edit-profile", "profile/edit"],
  ["settings", "profile/settings"],
  ["about", "profile/about"],
  ["help-support", "help"],
  ["privacy-policy", "profile/privacy"],
  ["terms-conditions", "profile/terms"],
  ["referral", "profile"], // until Phase 5
  ["refer-earn/ticket", "profile"], // until Phase 5
  ["chat", "orders"], // until Phase 5
  ["add-address", "addresses/new"],
  ["login", "auth/sign-in"],
  ["signup", "auth/sign-in"],
  ["otp", "auth/otp"],
  ["orders/details/:id", "orders/:id/details"],
  ["orders/track/:id", "orders/:id"],
  ["orders/delivered/:id", "orders/:id/details"],
  ["orders/success/:id", "orders/:id"],
  // Mart (quick/navigation/route_paths.dart)
  ["quick", "in-mart"],
  ["quick/home", "in-mart"],
  ["quick/categories", "in-mart/categories"],
  ["quick/category/:id", "in-mart/products/:id"],
  ["quick/products", "in-mart"],
  ["quick/product/:id", "product/:id"],
  ["quick/search", "in-mart"],
  ["quick/brands", "in-mart"],
  ["quick/cart", "cart"],
  ["quick/checkout", "cart"],
  ["quick/payment", "cart"],
  ["quick/coupons", "profile/coupons"],
  ["quick/orders", "orders"],
  ["quick/order/success", "orders"],
  ["quick/order/:id/track", "orders/:id"],
  ["quick/order/:id/chat", "orders/:id"],
  ["quick/order/:id", "orders/:id/details"],
  ["quick/wishlist", "profile/favorites"],
  ["quick/wallet", "wallet"],
  ["quick/addresses", "addresses"],
  ["quick/address/select", "addresses/new"],
  ["quick/location", ""],
  ["quick/notifications", "notifications"],
  ["quick/profile", "profile"],
  ["quick/profile/edit", "profile/edit"],
  ["quick/profile/help", "help"],
  ["quick/profile/settings", "profile/settings"],
  ["quick/profile/privacy", "profile/privacy"],
  ["quick/profile/terms", "profile/terms"],
  ["quick/profile/about", "profile/about"],
]

export function AliasRedirect({ to }) {
  const params = useParams()
  const { search, hash } = useLocation()
  const path = to.replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key] ?? ""))
  const target = `/food/user/${path}`.replace(/\/+$/, "")
  return <Navigate to={`${target}${search}${hash}`} replace />
}

/**
 * The module path the ported screens import from.
 *
 * The old app resolved `@/lib/api` to its own axios layer, which spoke the old
 * backend. Both apps alias `@` to `./src`, so keeping the path and swapping
 * what lives behind it is what lets 44 copied files run untouched.
 *
 * Everything real is in src/compat/legacyApi.js; this is only the address.
 */
export {
  api,
  adminAPI,
  authAPI,
  diningAPI,
  heroBannerAPI,
  locationAPI,
  orderAPI,
  restaurantAPI,
  userAPI,
  zoneAPI,
  API_ENDPOINTS,
  API_BASE_URL,
} from "@/compat/legacyApi";

export { default } from "@/compat/legacyApi";

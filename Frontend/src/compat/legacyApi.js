/**
 * Compatibility layer for the previous frontend's screens.
 *
 * The old app (`appzeto-food`) reached the backend through a single module,
 * `src/lib/api`, and 167 of its 414 screens import from it -- none of them
 * import axios directly. So porting those screens does not mean editing them:
 * it means providing this module. Screens compile untouched, and every
 * question about "does the new backend support that" is answered here, once.
 *
 * The old and new apps share ancestry, so most of the surface already exists
 * and is exercised daily by the current customer pages. Those are delegated,
 * not reimplemented -- a second implementation of getOrders would be a second
 * thing to keep correct.
 *
 * Three of the old methods have no backend behind them at all. They THROW
 * rather than resolve empty. The current app stubs its dead endpoints with
 * `{ success: false, data: null }` at HTTP 200, which is why a screen using
 * them renders blank instead of reporting a problem -- a ported screen
 * silently showing nothing is the failure mode this port can least afford.
 */
import apiClient, {
  adminAPI as newAdminAPI,
  authAPI as newAuthAPI,
  diningAPI as newDiningAPI,
  orderAPI as newOrderAPI,
  restaurantAPI as newRestaurantAPI,
  userAPI as newUserAPI,
  zoneAPI as newZoneAPI,
} from "@food/api";

/** A capability the old UI had and this backend does not expose. */
const unsupported = (name, detail) => () =>
  Promise.reject(
    new Error(
      `[legacyApi] ${name}() is not available on this backend. ${detail}`,
    ),
  );

// ---------------------------------------------------------------------------
// Delegated: same call, already proven by the current customer pages.
// ---------------------------------------------------------------------------

export const userAPI = {
  ...newUserAPI,
  /**
   * The old app read the saved delivery location back; the new backend only
   * accepts writes (`PATCH /user/location`). The profile carries the same
   * value, so this reads it from there rather than failing.
   */
  getLocation: async () => {
    const res = await newUserAPI.getProfile();
    const user = res?.data?.data ?? res?.data ?? {};
    return {
      ...res,
      data: {
        success: true,
        data: user.location ?? user.currentLocation ?? null,
      },
    };
  },
};

// The old screens build this payload with `x || null` throughout -- most
// importantly `restaurantId` and `couponCode`. The old backend ignored nulls;
// this one validates with Zod, where `z.string().optional()` accepts a missing
// key but NOT an explicit null, so every one of those became a 400 and pricing
// never came back. Dropping the null keys is exactly what the screens mean by
// them, and it keeps the fix out of the ported screens.
const dropNulls = (obj) =>
  Object.fromEntries(
    Object.entries(obj ?? {}).filter(([, v]) => v !== null && v !== undefined)
  );

export const orderAPI = {
  ...newOrderAPI,
  calculateOrder: (payload) => {
    const clean = dropNulls(payload);
    // restaurantId is required by the DTO, so without one the request can only
    // 400. The screens call this from an effect on every cart change, so return
    // an empty result instead of firing a request that cannot succeed.
    if (!clean.restaurantId) {
      return Promise.resolve({ data: { success: false, data: null } });
    }
    return newOrderAPI.calculateOrder(clean);
  },
  createOrder: (payload) => newOrderAPI.createOrder(dropNulls(payload)),
};
export const adminAPI = { ...newAdminAPI };
export const zoneAPI = { ...newZoneAPI };
/**
 * Alias `name` onto whatever this backend calls the restaurant.
 *
 * RestaurantDetails builds its heading from
 *   actualRestaurant?.name || apiRestaurant?.name || apiRestaurant?.restaurantName
 * where actualRestaurant is the UNWRAPPED record and apiRestaurant is still the
 * { restaurant } wrapper. This backend names the field `restaurantName` and
 * only ever nests it, so all three miss and the page renders the literal
 * "Unknown Restaurant" -- while address, rating and menu resolve fine from
 * other calls, which is what made it look cosmetic rather than a shape bug.
 */
const withNameAlias = (res) => {
  const body = res?.data?.data ?? res?.data ?? null;
  const record = body?.restaurant ?? body;
  if (!record || typeof record !== "object") return res;
  const named = { ...record, name: record.name ?? record.restaurantName };
  return { ...res, data: { success: true, data: named } };
};

export const diningAPI = {
  ...newDiningAPI,
  getRestaurantBySlug: async (slug, ...rest) =>
    withNameAlias(await newDiningAPI.getRestaurantBySlug(slug, ...rest)),
};

export const authAPI = {
  ...newAuthAPI,
  // No Firebase/Google exchange exists server-side. Phone OTP is the only
  // login this backend implements.
  firebaseGoogleLogin: unsupported(
    "authAPI.firebaseGoogleLogin",
    "This backend authenticates by phone OTP only -- use sendOTP/verifyOTP.",
  ),
};

export const restaurantAPI = {
  ...newRestaurantAPI,

  /**
   * Public lookup, by slug or id.
   *
   * The delegated getRestaurantById points at /food/admin/restaurants/:id,
   * which answers 'Authentication token missing' to a signed-out visitor. The
   * restaurant page is public and resolves its slug through this call, so it
   * fell back to a name match and rendered the address, rating and menu under
   * the heading 'Unknown Restaurant'.
   *
   * /food/restaurant/restaurants/:id needs no token and accepts either a slug
   * or an id, so it answers the question the page is actually asking.
   */
  getRestaurantById: async (idOrSlug, config = {}) =>
    withNameAlias(
      await apiClient.get(
        `/food/restaurant/restaurants/${encodeURIComponent(String(idOrSlug ?? ""))}`,
        { ...config, contextModule: "user" },
      ),
    ),
  /**
   * Hero-banner backed lists. The backend still serves all three, but the
   * current frontend replaced its heroBannerAPI with a stub, so these went
   * dark client-side rather than being removed.
   */
  getRestaurantsUnder250: (params = {}) =>
    apiClient.get("/food/hero-banners/under-250/public", {
      params,
      contextModule: "user",
    }),
};

// ---------------------------------------------------------------------------
// Restored: backend routes that exist but whose client was stubbed out.
// ---------------------------------------------------------------------------

export const heroBannerAPI = {
  getTop10Restaurants: (params = {}) =>
    apiClient.get("/food/hero-banners/public", {
      params,
      contextModule: "user",
    }),
  getGourmetRestaurants: (params = {}) =>
    apiClient.get("/food/hero-banners/gourmet/public", {
      params,
      contextModule: "user",
    }),
  getUnder250Restaurants: (params = {}) =>
    apiClient.get("/food/hero-banners/under-250/public", {
      params,
      contextModule: "user",
    }),
  getDiningBanners: (params = {}) =>
    apiClient.get("/food/hero-banners/dining/public", {
      params,
      contextModule: "user",
    }),
};

export const locationAPI = {
  /** `GET /zones/nearby` is this backend's equivalent of the old lookup. */
  getNearbyLocations: (params = {}) =>
    apiClient.get("/food/zones/nearby", { params, contextModule: "user" }),

  // The old backend proxied Google's reverse geocoder; this one does not, and
  // adding it would be a backend change. Callers that need an address from
  // coordinates should use the Maps JS SDK already loaded in the browser.
  reverseGeocode: unsupported(
    "locationAPI.reverseGeocode",
    "No server-side geocoder here -- use the Google Maps JS SDK client-side.",
  ),
};

// ---------------------------------------------------------------------------
// Endpoint constants the old screens reference directly.
// ---------------------------------------------------------------------------

/**
 * The six policy pages were separate endpoints in the old backend and are one
 * keyed route here, so they collapse onto `/pages/:key`.
 */
export const API_ENDPOINTS = {
  ADMIN: {
    ABOUT_PUBLIC: "/food/pages/about",
    PRIVACY_PUBLIC: "/food/pages/privacy",
    TERMS_PUBLIC: "/food/pages/terms",
    REFUND_PUBLIC: "/food/pages/refund",
    SHIPPING_PUBLIC: "/food/pages/shipping",
    CANCELLATION_PUBLIC: "/food/pages/cancellation",
    FEEDBACK_CREATE: "/food/restaurant/feedback-experience",
    FEEDBACK_EXPERIENCE_CREATE: "/food/restaurant/feedback-experience",
    SAFETY_EMERGENCY_CREATE: "/food/user/safety-emergency-reports",
    BUSINESS_SETTINGS_PUBLIC: "/food/admin/business-settings/public",
  },
  ORDER: {
    CREATE: "/food/orders",
  },
};

export const API_BASE_URL = apiClient?.defaults?.baseURL ?? "/api/v1";

/**
 * The old backend served everything from one flat namespace; this one puts it
 * behind a vertical. Screens that call apiClient directly therefore ask for
 * /hero-banners/public and get a 404, while anything routed through the
 * delegated objects works, because those carry the prefix already.
 *
 * Prefixing here rather than editing the screens keeps the ported files
 * byte-identical to the originals -- the property that makes 414 of them
 * feasible. Paths that already name a vertical, or are absolute, are left
 * alone.
 */
const withFoodPrefix = (url) => {
  if (typeof url !== 'string' || !url.startsWith('/')) return url;
  if (/^\/(food|quick|api|v1)(\/|$)/.test(url)) return url;
  return `/food${url}`;
};

const wrapMethod = (method) => (url, ...rest) =>
  apiClient[method](withFoodPrefix(url), ...rest);

export const api = new Proxy(apiClient, {
  get(target, prop, receiver) {
    if (['get', 'delete', 'head', 'options', 'post', 'put', 'patch'].includes(prop)) {
      return wrapMethod(prop);
    }
    return Reflect.get(target, prop, receiver);
  },
});
export default api;

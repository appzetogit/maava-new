/**
 * Old `@/lib/api/axios` address.
 *
 * Ported utils import the raw client from here by relative path
 * (`../api/axios.js`), so this path has to resolve as well as the named
 * exports. It is the current app's configured client -- interceptors, auth
 * headers and the vertical rewrite all included -- not a second instance.
 */
export { default } from "@food/api/axios";
export * from "@food/api/axios";

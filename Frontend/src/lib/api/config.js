/**
 * Old `@/lib/api/config` address. Three ported files import the endpoint
 * constants from here rather than from the api index, so both paths have to
 * resolve. Definitions live in the adapter.
 */
export { API_ENDPOINTS, API_BASE_URL } from "@/compat/legacyApi";

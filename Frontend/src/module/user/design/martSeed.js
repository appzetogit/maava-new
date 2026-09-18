import { publicConfigGetOnce } from "@food/api"

/**
 * The Mart brand colour, set by the operator in Admin -> Power Scanning ->
 * Mart Module and published at /food/admin/power-scanning/public as
 * `data.mart.themeColor`. Mirrors the app's MartBrandNotifier: serve the
 * cached value immediately (no one-frame flash of the default), then refresh
 * from the API; a failed fetch leaves the last known colour standing.
 *
 * Goes through publicConfigGetOnce so it shares the site's cached, de-duplicated
 * public-config request instead of adding another.
 */
const CACHE_KEY = "mv.martBrandColor"
const POWER_SCANNING_URL = "/food/admin/power-scanning/public"

const normalize = (value) => {
  const raw = String(value ?? "").trim().replace(/^#/, "")
  return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw.toUpperCase()}` : null
}

export function readCachedMartSeed() {
  try {
    return normalize(window.localStorage.getItem(CACHE_KEY))
  } catch {
    return null
  }
}

export async function loadMartSeed() {
  try {
    const res = await publicConfigGetOnce(POWER_SCANNING_URL)
    const data = res?.data?.data ?? res?.data ?? res
    const seed = normalize(data?.mart?.themeColor)
    if (!seed) return null
    try {
      window.localStorage.setItem(CACHE_KEY, seed)
    } catch {
      /* storage blocked: we still return the live colour */
    }
    return seed
  } catch {
    return null
  }
}

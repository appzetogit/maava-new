import { useEffect, useState } from "react"
import { publicConfigGetOnce } from "@food/api"

/**
 * Is Mart (quick commerce) switched on in Admin -> Feature Settings?
 *
 * Mirrors the app's martEnabledProvider exactly, including its default: while
 * the flags are unknown, Mart counts as enabled, so a slow request never hides
 * the switch from everyone. Uses the site's shared, cached public-config call.
 */
const FEATURE_URL = "/food/admin/feature-settings/public"
let known = null

export function useMartEnabled() {
  const [enabled, setEnabled] = useState(known ?? true)
  useEffect(() => {
    let alive = true
    publicConfigGetOnce(FEATURE_URL)
      .then((res) => {
        const rows = res?.data?.data
        const row = Array.isArray(rows) ? rows.find((r) => r?.key === "quick_commerce") : null
        known = row ? row.isEnabled !== false : true
        if (alive) setEnabled(known)
      })
      .catch(() => {
        /* keep the default, as the app does */
      })
    return () => {
      alive = false
    }
  }, [])
  return enabled
}

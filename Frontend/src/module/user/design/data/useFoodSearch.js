import { useCallback, useEffect, useState } from "react"
import { restaurantAPI, searchAPI } from "@food/api"
import { mapFood, mapRestaurant } from "./catalog"

/**
 * Search, as the app does it (data/datasources/search_remote_datasource.dart).
 *
 * Restaurants come from /food/search/unified. That endpoint is restaurant-shaped
 * even when a dish matched, so dishes come from the public food feed filtered by
 * name and description (the feed takes no query). The ₹99 Store chip swaps the
 * feed for the operator's switch99 promo list and drops restaurants.
 */
const listFrom = (res, key) => {
  const body = res?.data?.data ?? res?.data ?? {}
  if (Array.isArray(body?.[key])) return body[key]
  return Array.isArray(body) ? body : []
}
// Round so small location jitter doesn't re-run the search.
const coord = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : undefined
}

export function useFoodSearch(query, mode, { zoneId, lat, lng } = {}) {
  const [state, setState] = useState({ status: "idle", restaurants: [], dishes: [] })
  const [nonce, setNonce] = useState(0)
  const q = String(query || "").trim()
  const la = coord(lat)
  const ln = coord(lng)

  useEffect(() => {
    if (!q) {
      setState({ status: "idle", restaurants: [], dishes: [] })
      return undefined
    }
    let alive = true
    setState((s) => ({ ...s, status: "loading" }))
    // Same 300ms pause as the app before asking the server.
    const timer = setTimeout(async () => {
      try {
        const zone = zoneId || undefined
        const store99 = mode === "store99"
        const [restRes, foodRes] = await Promise.all([
          store99 ? null : searchAPI.unifiedSearch({ q, zoneId: zone, lat: la, lng: ln, limit: 20 }),
          restaurantAPI.getPublicFoods({ limit: 200, ...(zone ? { zoneId: zone } : {}), ...(store99 ? { promo: "switch99" } : {}) }),
        ])
        const lower = q.toLowerCase()
        const restaurants = restRes ? listFrom(restRes, "restaurants").map((r) => mapRestaurant(r)) : []
        const dishes = listFrom(foodRes, "foods")
          .map((f) => mapFood(f))
          .filter((d) => d.name.toLowerCase().includes(lower) || d.description.toLowerCase().includes(lower))
        if (alive) setState({ status: "ready", restaurants, dishes })
      } catch {
        if (alive) setState({ status: "error", restaurants: [], dishes: [] })
      }
    }, 300)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q, mode, zoneId, la, ln, nonce])

  const retry = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, retry }
}

/** Recent searches: newest first, case-insensitive de-dupe, at most 8 (search_local_datasource.dart). */
const RECENT_KEY = "mv.recentSearches"
const RECENT_MAX = 8

const readRecent = () => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")
    return Array.isArray(list) ? list.filter((s) => typeof s === "string" && s.trim()) : []
  } catch {
    return []
  }
}

export function useRecentSearches() {
  const [items, setItems] = useState(readRecent)

  const update = useCallback((fn) => {
    setItems((prev) => {
      const next = fn(prev)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        /* private mode: keep them for this visit only */
      }
      return next
    })
  }, [])

  const save = useCallback(
    (query) => {
      const clean = String(query || "").trim()
      if (!clean) return
      update((prev) => [clean, ...prev.filter((i) => i.toLowerCase() !== clean.toLowerCase())].slice(0, RECENT_MAX))
    },
    [update],
  )
  const remove = useCallback((query) => update((prev) => prev.filter((i) => i.toLowerCase() !== query.toLowerCase())), [update])
  const clear = useCallback(() => update(() => []), [update])

  return { items, save, remove, clear }
}

import { useCallback, useEffect, useState } from "react"
import { restaurantAPI } from "@food/api"
import { mapFood, mapRestaurant } from "./catalog"

/**
 * One restaurant and its menu, for the restaurant page.
 *
 * Two requests, both already cached and de-duplicated by the API layer: the
 * restaurant (by slug or id -- the backend resolves either) and its menu.
 *
 * Grouping differs from the app on purpose. The app ignores the restaurant's own
 * menu sections and guesses categories from dish names ("Breakfast",
 * "Beverages" ...). The website keeps the sections the restaurant actually set
 * up, and includes dishes nested in sub-sections, which the app drops -- so no
 * dish the website shows today disappears.
 */
const unwrapRestaurant = (res) => {
  const body = res?.data?.data ?? res?.data ?? {}
  return body?.restaurant ?? body
}

export function useRestaurantMenu(slug) {
  const [state, setState] = useState({ status: "loading", restaurant: null, sections: [], raw: null })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!slug) return undefined
    let alive = true
    setState((s) => ({ ...s, status: "loading" }))
    ;(async () => {
      try {
        const raw = unwrapRestaurant(await restaurantAPI.getRestaurantById(slug))
        if (!raw || !(raw._id || raw.id)) {
          if (alive) setState({ status: "missing", restaurant: null, sections: [], raw: null })
          return
        }
        const restaurant = mapRestaurant(raw)
        const menuRes = await restaurantAPI.getMenuByRestaurantId(restaurant.id)
        const menu = (menuRes?.data?.data ?? menuRes?.data ?? {}).menu ?? {}
        const sections = (menu.sections || [])
          .map((section, i) => {
            const items = [...(section.items || []), ...(section.subsections || []).flatMap((sub) => sub?.items || [])]
            return {
              id: String(section.id ?? section.categoryId ?? `section-${i}`),
              name: String(section.name || "Menu").trim(),
              items: items.map((item) => mapFood(item, restaurant)),
            }
          })
          .filter((section) => section.items.length > 0)
        if (alive) setState({ status: "ready", restaurant, sections, raw })
      } catch (err) {
        if (!alive) return
        const missing = err?.response?.status === 404
        setState({ status: missing ? "missing" : "error", restaurant: null, sections: [], raw: null })
      }
    })()
    return () => {
      alive = false
    }
  }, [slug, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}

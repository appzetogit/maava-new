import { useCallback, useEffect, useState } from "react"
import { adminAPI, publicConfigGetOnce, restaurantAPI } from "@food/api"
import { mapFood, mapRestaurant } from "./catalog"

/**
 * Everything the Food home shows, loaded the way the app's HomeViewModel does:
 * categories, popular foods, restaurants (50, nearest first when we know where
 * the customer is), the header's hero images, the promo carousel and the 99
 * Store carousel -- in parallel, each section independent so one failure never
 * blanks the page.
 *
 * Like the app, listings are not scoped to a delivery zone (food restaurants
 * carry no zone; deliverability is checked at checkout), but the customer's
 * coordinates are sent so the backend can rank by distance.
 *
 * API calls: the one-off sections load once per visit. Only the restaurant
 * list depends on location, and it refetches only when the position moves by
 * roughly 100 m -- GPS jitter does not trigger a reload.
 */
const LOADING = { status: "loading", data: [] }

const listFrom = (res, ...keys) => {
  const body = res?.data?.data ?? res?.data ?? {}
  for (const key of keys) if (Array.isArray(body?.[key])) return body[key]
  return Array.isArray(body) ? body : []
}

const toBanners = (res) =>
  listFrom(res, "banners")
    .filter((b) => b?.imageUrl)
    .map((b) => ({ id: b._id, imageUrl: b.imageUrl, alt: b.title || "Offer", linkedRestaurants: b.linkedRestaurants || [] }))

const round3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null)

// zoneId: the customer's delivery zone. Restaurants, dishes and categories are
// scoped to it (the backend filters by zoneId; lat/lng alone doesn't filter).
// zoneReady: false while the zone for a known location is still being looked
// up, so the lists don't flash every zone's restaurants first.
export function useFoodHome({ lat, lng, zoneId = null, zoneReady = true } = {}) {
  const [categories, setCategories] = useState(LOADING)
  const [foods, setFoods] = useState(LOADING)
  const [restaurants, setRestaurants] = useState(LOADING)
  const [heroBanners, setHeroBanners] = useState(LOADING)
  const [promoBanners, setPromoBanners] = useState(LOADING)
  const [store99Banners, setStore99Banners] = useState(LOADING)
  const [nonce, setNonce] = useState(0)

  const track = (setter, promise) =>
    promise.then(
      (data) => setter({ status: "ready", data }),
      () => setter({ status: "error", data: [] }),
    )

  useEffect(() => {
    if (!zoneReady) return
    track(
      setCategories,
      adminAPI.getPublicCategories(zoneId ? { zoneId } : {}).then((res) =>
        listFrom(res, "categories")
          .filter((c) => c && c.isActive !== false && String(c.name ?? "").trim())
          .map((c) => ({ id: String(c._id ?? c.id), name: String(c.name).trim(), imageUrl: c.image })),
      ),
    )
    track(setFoods, restaurantAPI.getPublicFoods(zoneId ? { zoneId } : {}).then((res) => listFrom(res, "foods").map((f) => mapFood(f))))
    track(setHeroBanners, publicConfigGetOnce("/food/hero-banners/public").then((res) => toBanners(res).map((b) => b.imageUrl)))
    track(setPromoBanners, publicConfigGetOnce("/food/hero-banners/home-promotion/public").then(toBanners))
    track(setStore99Banners, publicConfigGetOnce("/food/hero-banners/under-250/public").then(toBanners))
  }, [nonce, zoneId, zoneReady])

  const rLat = round3(lat)
  const rLng = round3(lng)
  useEffect(() => {
    if (!zoneReady) return
    const coords = rLat != null && rLng != null ? { lat: rLat, lng: rLng } : {}
    track(
      setRestaurants,
      restaurantAPI.getRestaurants({ limit: 50, ...coords, ...(zoneId ? { zoneId } : {}) }).then((res) => listFrom(res, "restaurants").map(mapRestaurant)),
    )
  }, [rLat, rLng, zoneId, zoneReady, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { categories, foods, restaurants, heroBanners, promoBanners, store99Banners, reload }
}

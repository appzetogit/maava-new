import { useEffect, useRef, useState } from "react"
import { Crosshair, Minus, Plus } from "lucide-react"
import { MUTED_STYLE, loadGoogleMaps as loadGoogle } from "../data/googleMaps"
import bikeIcon from "@/assets/bikelogo.png"

/**
 * The live map (presentation/orders/widgets/live_tracking_map.dart), on the
 * Google Maps JS API with the app's muted-grey style.
 *
 * Restaurant (red) and home (green) pins; the rider's bike, only once there's a
 * real position, gliding between fixes; the road route in the brand colour, or
 * a dotted arc from restaurant to home until a route exists. The camera fits
 * everything once, then follows the rider until the customer moves the map;
 * Recenter fits again.
 */
const GLYPHS = {
  restaurant: "M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2 M6 2v18 M16 15V2a4 4 0 0 0-4 4v6c0 1.1.9 2 2 2h2 M16 15v5",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
}
const pinIcon = (fill, glyph) =>
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44"><path d="M17 42C17 42 3.5 27.5 3.5 16.5a13.5 13.5 0 1 1 27 0C30.5 27.5 17 42 17 42Z" fill="${fill}" stroke="#fff" stroke-width="2.5"/><g transform="translate(9 8.5) scale(0.67)" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPHS[glyph]}"/></g></svg>`,
  )

/** A gentle curve from a to b, bowed sideways by 18% of the distance. */
function arc(a, b, steps = 48) {
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
  const ctrl = { lat: mid.lat - (b.lng - a.lng) * 0.18, lng: mid.lng + (b.lat - a.lat) * 0.18 }
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const u = 1 - t
    return { lat: u * u * a.lat + 2 * u * t * ctrl.lat + t * t * b.lat, lng: u * u * a.lng + 2 * u * t * ctrl.lng + t * t * b.lng }
  })
}

const same = (a, b) => a && b && Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6

export default function TrackingMap({ restaurant, customer, rider, route, expanded }) {
  const elRef = useRef(null)
  const g = useRef({}) // google objects
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [follow, setFollow] = useState(true)
  const followRef = useRef(true)
  followRef.current = follow

  // Create the map once.
  useEffect(() => {
    let alive = true
    loadGoogle()
      .then((google) => {
        if (!alive || !elRef.current || g.current.map) return
        const center = rider || restaurant || customer || { lat: 20.5937, lng: 78.9629 }
        const map = new google.maps.Map(elRef.current, {
          center,
          zoom: 15,
          styles: MUTED_STYLE,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          keyboardShortcuts: true,
        })
        map.addListener("dragstart", () => setFollow(false))
        const brand = getComputedStyle(elRef.current).getPropertyValue("--mv-brand").trim() || "#8B5CF6"
        g.current = {
          google,
          map,
          brand,
          route: new google.maps.Polyline({ map, strokeColor: brand, strokeWeight: 5, strokeOpacity: 1, geodesic: true, zIndex: 2 }),
          pending: new google.maps.Polyline({
            map,
            strokeOpacity: 0,
            zIndex: 1,
            icons: [{ icon: { path: google.maps.SymbolPath.CIRCLE, scale: 2, fillColor: "#9AA0A6", fillOpacity: 1, strokeOpacity: 0 }, offset: "0", repeat: "14px" }],
          }),
        }
        setReady(true)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fit = () => {
    const { google, map } = g.current
    if (!map) return
    const pts = [rider, restaurant, customer, ...(route?.points || [])].filter(Boolean)
    if (pts.length === 0) return
    if (pts.length === 1) {
      map.panTo(pts[0])
      return
    }
    const bounds = new google.maps.LatLngBounds()
    pts.forEach((p) => bounds.extend(p))
    map.fitBounds(bounds, 56)
  }

  // Restaurant and home pins.
  useEffect(() => {
    if (!ready) return
    const { google, map } = g.current
    const place = (key, pos, fill, glyph, title) => {
      if (!pos) {
        g.current[key]?.setMap(null)
        g.current[key] = null
        return
      }
      if (!g.current[key]) {
        g.current[key] = new google.maps.Marker({
          map,
          position: pos,
          title,
          zIndex: 3,
          icon: { url: pinIcon(fill, glyph), scaledSize: new google.maps.Size(34, 44), anchor: new google.maps.Point(17, 43) },
        })
      } else if (!same(g.current[key].getPosition()?.toJSON(), pos)) g.current[key].setPosition(pos)
    }
    place("restMarker", restaurant, "#E23744", "restaurant", "Restaurant")
    place("homeMarker", customer, "#1BA672", "home", "Your address")
    if (!g.current.fitted && (restaurant || customer)) {
      g.current.fitted = true
      fit()
    }
  }, [ready, restaurant?.lat, restaurant?.lng, customer?.lat, customer?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Route, or the dotted arc until one exists.
  useEffect(() => {
    if (!ready) return
    const pts = route?.points || []
    g.current.route.setPath(pts.length >= 2 ? pts : [])
    g.current.pending.setPath(pts.length < 2 && restaurant && customer ? arc(restaurant, customer) : [])
    if (pts.length >= 2 && !g.current.routeFitted) {
      g.current.routeFitted = true
      fit()
    }
  }, [ready, route, restaurant?.lat, restaurant?.lng, customer?.lat, customer?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rider: glide from the drawn point to the new fix.
  useEffect(() => {
    if (!ready) return
    const { google, map } = g.current
    if (!rider) {
      g.current.riderMarker?.setMap(null)
      g.current.riderMarker = null
      return
    }
    if (!g.current.riderMarker) {
      g.current.riderMarker = new google.maps.Marker({
        map,
        position: rider,
        title: "Delivery partner",
        zIndex: 5,
        icon: { url: bikeIcon, scaledSize: new google.maps.Size(44, 44), anchor: new google.maps.Point(22, 22) },
      })
      g.current.lastFixAt = Date.now()
      fit()
      return
    }
    const marker = g.current.riderMarker
    const from = marker.getPosition()?.toJSON()
    if (!from || same(from, rider)) return
    const now = Date.now()
    const duration = Math.min(12000, Math.max(900, now - (g.current.lastFixAt || now)))
    g.current.lastFixAt = now
    cancelAnimationFrame(g.current.raf)
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const start = performance.now()
    const step = (t) => {
      const k = reduce ? 1 : Math.min(1, (t - start) / duration)
      const pos = { lat: from.lat + (rider.lat - from.lat) * k, lng: from.lng + (rider.lng - from.lng) * k }
      marker.setPosition(pos)
      if (followRef.current) map.panTo(pos)
      if (k < 1) g.current.raf = requestAnimationFrame(step)
    }
    g.current.raf = requestAnimationFrame(step)
  }, [ready, rider?.lat, rider?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when the map is expanded or collapsed.
  useEffect(() => {
    if (!ready) return undefined
    const t = setTimeout(fit, 250)
    return () => clearTimeout(t)
  }, [ready, expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => cancelAnimationFrame(g.current.raf), [])

  if (failed) {
    return (
      <div className="ft-mapview ft-mapview--off" role="img" aria-label="Map unavailable">
        <span>The map isn&apos;t available right now. Your order updates below are still live.</span>
      </div>
    )
  }

  return (
    <div className="ft-mapview">
      <div ref={elRef} className="ft-mapview__canvas" aria-label="Live delivery map" role="region" />
      {ready && (
        <div className="ft-mapview__controls">
          <button type="button" aria-label="Zoom in" onClick={() => g.current.map.setZoom(g.current.map.getZoom() + 1)}>
            <Plus aria-hidden="true" />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => g.current.map.setZoom(g.current.map.getZoom() - 1)}>
            <Minus aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Recenter on route"
            aria-pressed={follow}
            onClick={() => {
              setFollow(true)
              fit()
            }}
          >
            <Crosshair aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}

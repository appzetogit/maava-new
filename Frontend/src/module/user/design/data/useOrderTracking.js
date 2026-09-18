import { useCallback, useEffect, useRef, useState } from "react"
import { io } from "socket.io-client"
import apiClient, { orderAPI } from "@food/api"
import { getModuleToken } from "@/lib/utils/auth"

/**
 * One order, kept live -- the app's order_tracking_viewmodel.dart on the web.
 *
 * - The order comes from GET /food/orders/:id (the URL may carry the display
 *   number or the database id; the backend accepts either).
 * - Live updates come over the socket at /socket.io with the customer's token:
 *   order_status_update / order_ready trigger a refetch, location-update moves
 *   the rider, delivery_drop_otp shows the handover code.
 * - The rider app broadcasts to the tracking room named by the order's
 *   DATABASE id, so we join with that id, not the number in the URL.
 * - GET /food/orders/:id/route gives the road route for the rider's current
 *   leg every 8s while the order is active.
 * - If the socket is down, the order is polled every 4s (20s while it's up,
 *   as a safety net for missed events).
 */
export const ACTIVE = new Set(["created", "confirmed", "preparing", "ready_for_pickup", "reached_pickup", "picked_up", "reached_drop"])
export const isCancelled = (s) => String(s || "").startsWith("cancel")
export const isDelivered = (s) => s === "delivered" || s === "completed"

const bodyOf = (res) => res?.data?.data ?? res?.data ?? {}
const messageOf = (err) => {
  const data = err?.response?.data
  if (err?.response?.status === 404) return "We couldn't find this order."
  if (typeof data?.message === "string" && data.message) return data.message
  if (err?.code === "ERR_NETWORK") return "No internet connection."
  return "Could not load tracking details."
}

export function pointOf(v) {
  if (!v || typeof v !== "object") return null
  const coords = Array.isArray(v.coordinates) ? v.coordinates : Array.isArray(v) ? [v[1], v[0]] : null
  const lat = Number(v.lat ?? v.latitude ?? v.boy_lat ?? (coords ? coords[1] : undefined))
  const lng = Number(v.lng ?? v.longitude ?? v.boy_lng ?? (coords ? coords[0] : undefined))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null
  return { lat, lng }
}

/** Google encoded polyline (precision 1e5) -> [{lat, lng}]. */
export function decodePolyline(str) {
  const points = []
  let index = 0
  let lat = 0
  let lng = 0
  while (str && index < str.length) {
    for (const axis of [0, 1]) {
      let result = 0
      let shift = 0
      let byte
      do {
        byte = str.charCodeAt(index++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20 && index < str.length)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += delta
      else lng += delta
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}

export function useOrderTracking(orderId) {
  const [state, setState] = useState({ status: "loading", order: null, error: null })
  const [live, setLive] = useState(null) // last socket position {lat, lng, heading, at}
  const [route, setRoute] = useState(null)
  const [socketOtp, setSocketOtp] = useState(null)
  const [connected, setConnected] = useState(false)

  const order = state.order
  const mongoId = order ? String(order._id || order.orderMongoId || "") : ""
  const displayId = order ? String(order.orderId || order.order_id || mongoId) : ""
  const status = String(order?.orderStatus || order?.status || "")
  const active = ACTIVE.has(status)

  const load = useCallback(async () => {
    // Local development only (dead code in production builds): a sample order.
    if (import.meta.env.DEV && orderId === "demo") {
      const { demoOrder } = await import("./demoOrder.dev.js")
      setState({ status: "ready", order: demoOrder, error: null })
      return
    }
    try {
      const body = bodyOf(await orderAPI.getOrderDetails(orderId))
      const next = body?.order ?? body
      if (!next || !(next._id || next.orderMongoId)) throw Object.assign(new Error("missing"), { response: { status: 404 } })
      setState({ status: "ready", order: next, error: null })
    } catch (err) {
      // A failed refresh keeps showing the order we have.
      setState((s) => (s.order ? s : { status: "error", order: null, error: messageOf(err) }))
    }
  }, [orderId])

  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    setState({ status: "loading", order: null, error: null })
    setLive(null)
    setRoute(null)
    setSocketOtp(null)
    load()
  }, [load])

  // Poll: quickly while the socket is down, slowly as a safety net while it's up.
  useEffect(() => {
    if (state.status !== "ready" || !active) return undefined
    const t = setInterval(() => loadRef.current(), connected ? 20000 : 4000)
    return () => clearInterval(t)
  }, [state.status, active, connected])

  // Socket.
  useEffect(() => {
    if (!mongoId) return undefined
    const token = getModuleToken("user")
    if (!token) return undefined
    const socket = io(window.location.origin, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    })
    const mine = (p) => {
      const id = String(p?.orderMongoId || p?.orderId || "")
      return !id || id === mongoId || id === displayId
    }
    socket.on("connect", () => {
      setConnected(true)
      socket.emit("join-tracking", mongoId)
    })
    socket.on("disconnect", () => setConnected(false))
    socket.on("connect_error", () => setConnected(false))
    socket.on("order_status_update", (p) => mine(p) && loadRef.current())
    socket.on("order_ready", (p) => mine(p) && loadRef.current())
    socket.on("location-update", (p) => {
      if (!mine(p)) return
      const pos = pointOf(p)
      if (pos) setLive({ ...pos, heading: Number(p?.heading) || 0, at: Date.now() })
    })
    socket.on("delivery_drop_otp", (p) => {
      if (mine(p) && p?.otp) setSocketOtp(String(p.otp))
    })
    return () => {
      socket.emit("leave-tracking", mongoId)
      socket.disconnect()
      setConnected(false)
    }
  }, [mongoId, displayId])

  // Road route for the rider's current leg.
  useEffect(() => {
    if (!mongoId || !active) return undefined
    let alive = true
    let busy = false
    const fetchRoute = async () => {
      if (busy) return
      busy = true
      try {
        const r = bodyOf(await apiClient.get(`/food/orders/${encodeURIComponent(mongoId)}/route`, { contextModule: "user" }))
        const points = decodePolyline(String(r?.polyline || ""))
        if (alive) {
          setRoute((prev) =>
            points.length >= 2
              ? { points, target: r?.target || null, durationMins: r?.durationMins ?? null, origin: pointOf(r?.origin) }
              : prev && { ...prev, origin: pointOf(r?.origin) || prev.origin },
          )
        }
      } catch {
        /* the map keeps what it has */
      } finally {
        busy = false
      }
    }
    fetchRoute()
    const t = setInterval(fetchRoute, 8000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [mongoId, active, status])

  const partnerRaw = order?.dispatch?.deliveryPartnerId ?? order?.deliveryPartnerId
  const partner = partnerRaw && typeof partnerRaw === "object" ? partnerRaw : null
  const hasRider = Boolean(partner) && String(order?.dispatch?.status || "") === "accepted" && active

  // Rider position: a fresh socket fix, else the route's origin, else the last known ping.
  const fresh = live && Date.now() - live.at < 20000
  const riderPos = hasRider ? (fresh ? live : route?.origin || pointOf(order?.deliveryState?.currentLocation) || live) : null

  const dropVerified = Boolean(order?.deliveryVerification?.dropOtp?.verified)
  const otp = dropVerified || !active ? null : socketOtp || (order?.handoverOtp ? String(order.handoverOtp) : null)

  // loadStatus is the fetch (loading | ready | error); status is the order's own status.
  return { loadStatus: state.status, error: state.error, order, mongoId, displayId, status, active, connected, route, riderPos, hasRider, partner, otp, refresh: load }
}

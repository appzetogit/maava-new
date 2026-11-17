import { useCallback, useEffect, useRef, useState } from "react"
import { orderAPI } from "@food/api"
import { ACTIVE } from "./useOrderTracking"

/**
 * The customer's orders, newest first (GET /food/orders?page&limit; the
 * backend leaves out unpaid online orders). Pages load on demand; while any
 * loaded order is still active the first page is refreshed every 20s, as the
 * current page does, so statuses move without a reload.
 */
const PAGE_SIZE = 20

const listOf = (res) => {
  const body = res?.data?.data ?? res?.data ?? {}
  const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.orders) ? body.orders : []
  const meta = body?.meta || res?.data?.meta || {}
  return { list, totalPages: Number(meta.totalPages) || 1 }
}
const idOf = (o) => String(o?._id || o?.orderMongoId || o?.orderId || "")

export function useOrdersList({ demo = false } = {}) {
  const [state, setState] = useState({ status: "loading", orders: [], page: 1, totalPages: 1, loadingMore: false, error: null })
  const pageRef = useRef(1)

  const loadFirst = useCallback(async (quiet = false) => {
    // Local development only (dead code in production builds): sample orders.
    if (import.meta.env.DEV && demo) {
      const { demoOrders } = await import("./demoOrder.dev.js")
      setState((s) => ({ ...s, status: "ready", orders: demoOrders, totalPages: 1 }))
      return
    }
    if (!quiet) setState((s) => ({ ...s, status: s.orders.length ? s.status : "loading", error: null }))
    try {
      const { list, totalPages } = listOf(await orderAPI.getOrders({ page: 1, limit: PAGE_SIZE }))
      setState((s) => {
        // Keep later pages the customer already loaded; refresh the first one.
        const fresh = new Set(list.map(idOf))
        const rest = s.orders.slice(PAGE_SIZE).filter((o) => !fresh.has(idOf(o)))
        return { ...s, status: "ready", orders: [...list, ...rest], totalPages, error: null }
      })
    } catch (err) {
      if (!quiet) setState((s) => ({ ...s, status: s.orders.length ? "ready" : "error", error: err?.response?.data?.message || "Could not load your orders." }))
    }
  }, [demo])

  const loadMore = useCallback(async () => {
    const next = pageRef.current + 1
    setState((s) => ({ ...s, loadingMore: true }))
    try {
      const { list, totalPages } = listOf(await orderAPI.getOrders({ page: next, limit: PAGE_SIZE }))
      pageRef.current = next
      setState((s) => {
        const seen = new Set(s.orders.map(idOf))
        return { ...s, orders: [...s.orders, ...list.filter((o) => !seen.has(idOf(o)))], page: next, totalPages, loadingMore: false }
      })
    } catch {
      setState((s) => ({ ...s, loadingMore: false }))
    }
  }, [])

  useEffect(() => {
    loadFirst()
  }, [loadFirst])

  const anyActive = state.orders.some((o) => ACTIVE.has(String(o?.orderStatus || o?.status || "")))
  useEffect(() => {
    if (!anyActive) return undefined
    const t = setInterval(() => loadFirst(true), 20000)
    return () => clearInterval(t)
  }, [anyActive, loadFirst])

  return { ...state, hasMore: state.page < state.totalPages, loadMore, reload: () => loadFirst() }
}

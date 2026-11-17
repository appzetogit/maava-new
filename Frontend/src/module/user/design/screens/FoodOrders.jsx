import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Bike,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Headset,
  Navigation,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  XCircle,
} from "lucide-react"
import { BottomSheet, Button, IconButton, SkeletonOrderCard, SmartImage } from "../index"
import { ACTIVE, isCancelled } from "../data/useOrderTracking"
import { useOrdersList } from "../data/useOrdersList"
import { useReorder } from "../data/useReorder"
import "./orders.css"

/**
 * My Orders, rebuilt from presentation/orders/screens/orders_screen.dart:
 * gradient header with a filter, Active / Past tabs, order cards (restaurant,
 * order number, date and time, status chip, item count, total, rate prompt,
 * Track or Reorder), and a Need Help card.
 *
 * Differences from the app, on purpose: it opens on Active when something is
 * on its way (the app always opens on Past), shows loading and error states
 * (the app shows "No orders" for both), never prints placeholder dates, and a
 * card opens the tracking page, which holds the order's details, rating and
 * reorder.
 */
const LABELS = {
  pending_payment: "Awaiting payment",
  created: "Order placed",
  confirmed: "Confirmed",
  preparing: "Preparing your food",
  ready_for_pickup: "Ready for pickup",
  reached_pickup: "Rider at restaurant",
  picked_up: "On the way",
  reached_drop: "Rider has arrived",
}
const FILTERS = [
  ["all", "All"],
  ["delivered", "Delivered"],
  ["cancelled", "Cancelled"],
]
const statusOf = (o) => String(o?.orderStatus || o?.status || "")
const isDeliveredStatus = (s) => s === "delivered" || s === "completed"
const money = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateOf = (iso) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}
const fmtDate = (d) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
const fmtTime = (d) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
const trackPath = (o) => `/food/user/orders/${encodeURIComponent(String(o.orderId || o.order_id || o._id))}`

function StatusChip({ order }) {
  const s = statusOf(order)
  if (isDeliveredStatus(s)) {
    return (
      <span className="fo-chip fo-chip--ok">
        <CheckCircle2 aria-hidden="true" />
        Delivered
      </span>
    )
  }
  if (isCancelled(s)) {
    const label = s === "cancelled_by_restaurant" || String(order.cancelledBy).toLowerCase() === "restaurant" ? "Cancelled by restaurant" : s === "cancelled_by_user" ? "Cancelled by you" : "Cancelled"
    return (
      <span className="fo-chip fo-chip--bad">
        <XCircle aria-hidden="true" />
        {label}
      </span>
    )
  }
  return (
    <span className="fo-chip">
      <Bike aria-hidden="true" />
      {LABELS[s] || s.replace(/_/g, " ") || "On the way"}
    </span>
  )
}

function OrderCard({ order, onOpen, onPrimary }) {
  const s = statusOf(order)
  const active = ACTIVE.has(s)
  const cancelled = isCancelled(s)
  const r = order.restaurantId && typeof order.restaurantId === "object" ? order.restaurantId : {}
  const name = r.restaurantName || order.restaurantName || "MAAVA"
  const created = dateOf(order.createdAt)
  const count = (order.items || []).reduce((n, it) => n + (Number(it.quantity) || 1), 0)
  const total = order.pricing?.total
  const canRate = isDeliveredStatus(s) && !(Number(order.ratings?.restaurant?.rating) > 0)
  return (
    <article className="fo-card">
      <button type="button" className="fo-card__open" onClick={onOpen} aria-label={`Open order from ${name}`} />
      <div className="fo-card__head">
        <span className="fo-card__logo">
          <SmartImage src={r.profileImage} alt="" category="restaurant" />
        </span>
        <div className="fo-card__who">
          <h3>{name}</h3>
          <span className="fo-card__id">Order ID: #{order.orderId || order.order_id || order._id}</span>
          {created && (
            <span className="fo-card__when">
              <CalendarDays aria-hidden="true" />
              {fmtDate(created)}
              <i aria-hidden="true">|</i>
              <Clock aria-hidden="true" />
              {fmtTime(created)}
            </span>
          )}
        </div>
        <StatusChip order={order} />
      </div>

      <div className="fo-card__items">
        <b>{count}x</b>
        <span>
          {count} item{count === 1 ? "" : "s"}
        </span>
        <strong>{money(total)}</strong>
      </div>

      {canRate && (
        <button type="button" className="fo-rate" onClick={onOpen}>
          <Star aria-hidden="true" />
          Rate your food &amp; delivery experience
          <ChevronRight aria-hidden="true" />
        </button>
      )}

      <button type="button" className={cancelled ? "fo-primary fo-primary--bad" : "fo-primary"} onClick={onPrimary}>
        {active ? <Navigation aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
        {active ? "TRACK ORDER" : "REORDER"}
      </button>

      <div className="fo-card__foot">
        <span>{created ? `Ordered: ${fmtDate(created)}, ${fmtTime(created)}` : ""}</span>
        <span>
          <i aria-hidden="true">| </i>Bill Total: <b className={cancelled ? "is-bad" : ""}>{money(total)}</b>
        </span>
      </div>
    </article>
  )
}

export default function FoodOrders({ demo = false }) {
  const navigate = useNavigate()
  const list = useOrdersList({ demo })
  const { reorder, sheet: reorderSheet } = useReorder()
  const [tab, setTab] = useState(null) // null until we know whether anything is active
  const [filter, setFilter] = useState("all")
  const [filterOpen, setFilterOpen] = useState(false)

  const active = useMemo(() => list.orders.filter((o) => ACTIVE.has(statusOf(o))), [list.orders])
  const past = useMemo(() => {
    const all = list.orders.filter((o) => !ACTIVE.has(statusOf(o)))
    if (filter === "delivered") return all.filter((o) => isDeliveredStatus(statusOf(o)))
    if (filter === "cancelled") return all.filter((o) => isCancelled(statusOf(o)))
    return all
  }, [list.orders, filter])

  useEffect(() => {
    if (tab == null && list.status === "ready") setTab(active.length ? "active" : "past")
  }, [tab, list.status, active.length])
  const current = tab || "past"
  const shown = current === "active" ? active : past

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/food/user"))

  return (
    <div className="fo">
      <header className="fo-head">
        <div className="fo-head__bar">
          <IconButton label="Back" onClick={back} className="fo-roundbtn">
            <ArrowLeft />
          </IconButton>
          <div className="fo-head__titles">
            <h1>My Orders</h1>
            <p>Track, view and reorder your food</p>
          </div>
          <IconButton label="Filter past orders" onClick={() => setFilterOpen(true)} className="fo-roundbtn">
            <SlidersHorizontal />
          </IconButton>
        </div>
        <div className="fo-tabs" role="tablist" aria-label="Orders">
          {[
            ["active", `Active Orders (${active.length})`],
            ["past", `Past Orders (${past.length})`],
          ].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={current === id} onClick={() => setTab(id)}>
              <ShoppingBag aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="fo-body" role="tabpanel">
        {list.status === "loading" ? (
          <div className="fo-list" aria-busy="true" aria-label="Loading your orders">
            <SkeletonOrderCard />
            <SkeletonOrderCard />
            <SkeletonOrderCard />
          </div>
        ) : list.status === "error" ? (
          <div className="fo-empty" role="alert">
            <span className="fo-empty__icon" aria-hidden="true">
              <Receipt />
            </span>
            <h2>Your orders didn&apos;t load</h2>
            <p>{list.error}</p>
            <Button block={false} size="md" onClick={list.reload}>
              Try again
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <div className="fo-empty">
            <span className="fo-empty__icon" aria-hidden="true">
              <Receipt />
            </span>
            <h2>{current === "active" ? "No Active Orders" : filter === "all" ? "No Past Orders" : `No ${filter} orders`}</h2>
            <p>{current === "active" ? "Your active food orders will appear here." : "You have no past completed or cancelled orders."}</p>
            {current === "active" && (
              <Button block={false} size="md" onClick={() => navigate("/food/user")}>
                Order food
              </Button>
            )}
          </div>
        ) : (
          <div className="fo-list">
            {shown.map((o) => (
              <OrderCard
                key={String(o._id || o.orderId)}
                order={o}
                onOpen={() => navigate(trackPath(o))}
                onPrimary={() => (ACTIVE.has(statusOf(o)) ? navigate(trackPath(o)) : reorder(o))}
              />
            ))}
            {list.hasMore && (
              <button type="button" className="fo-more" onClick={list.loadMore} disabled={list.loadingMore}>
                {list.loadingMore ? "Loading…" : "Load more orders"}
              </button>
            )}
          </div>
        )}

        <section className="fo-help">
          <span className="fo-help__icon" aria-hidden="true">
            <ShieldCheck />
          </span>
          <div>
            <b>Need Help?</b>
            <p>For any issue with your order, contact our support team.</p>
          </div>
          <button type="button" onClick={() => navigate("/food/user/help")}>
            <Headset aria-hidden="true" />
            Contact Support
          </button>
        </section>
      </main>

      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter Orders">
        <div className="fo-filters" role="radiogroup" aria-label="Show past orders">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={filter === id}
              onClick={() => {
                setFilter(id)
                setTab("past")
                setFilterOpen(false)
              }}
            >
              {label}
              {filter === id && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
      </BottomSheet>

      {reorderSheet}
    </div>
  )
}

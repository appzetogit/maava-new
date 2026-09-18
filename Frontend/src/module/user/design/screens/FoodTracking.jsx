import { Suspense, lazy, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  Circle,
  CircleDot,
  Headset,
  Home,
  Loader2,
  Maximize2,
  MapPin,
  Phone,
  RefreshCw,
  Share2,
  ShieldCheck,
  Star,
  Store,
  User,
  X,
  XCircle,
} from "lucide-react"
import { orderAPI } from "@food/api"
import { BottomSheet, Button, IconButton, SkeletonBox, toast } from "../index"
import { useReorder } from "../data/useReorder"
import { isCancelled, isDelivered, pointOf, useOrderTracking } from "../data/useOrderTracking"
import "./tracking.css"

const TrackingMap = lazy(() => import("./TrackingMap"))

/**
 * Order tracking, rebuilt from presentation/orders/screens/order_tracking_screen.dart
 * (with the delivered and cancelled states folded in, so the page stays useful
 * after the order ends instead of bouncing the customer away).
 *
 * Header with the status in large type; live map; delivery code; rider card
 * with call; safety note; delivery details; order summary; status timeline;
 * the 1-minute cancel window; and, once delivered, rating and reorder.
 *
 * Unlike the app it doesn't append a hard-coded "On Time" to the ETA, says
 * "Waiting for the restaurant to confirm" (not "delivery partner") before the
 * restaurant accepts, and never shows developer notes to customers.
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
  delivered: "Delivered",
  completed: "Delivered",
  cancelled_by_user: "Cancelled by you",
  cancelled_by_restaurant: "Cancelled by restaurant",
  cancelled_by_admin: "Cancelled",
}
const labelOf = (s) => LABELS[s] || (isCancelled(s) ? "Cancelled" : String(s || "Order").replace(/_/g, " "))

const STAGES = [
  ["created", "Order placed"],
  ["confirmed", "Order confirmed"],
  ["preparing", "Preparing your food"],
  ["ready_for_pickup", "Food is ready"],
  ["reached_pickup", "Rider at restaurant"],
  ["picked_up", "Order picked up"],
  ["reached_drop", "Arriving at your door"],
  ["delivered", "Delivered"],
]
const PAID_VIA = { cash: "Cash on Delivery", razorpay: "UPI / Card", razorpay_qr: "Pay on delivery (QR)", wallet: "MAAVA Wallet", card: "Card" }
const CANCEL_WINDOW_MS = 60 * 1000
const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`
const timeOf = (iso) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : ""
}

function etaLabel(order) {
  const eta = order?.eta || {}
  const source = eta.source || "unavailable"
  if (source !== "live" && source !== "estimate") return null
  let minutes = Number(eta.minutes)
  if (!(minutes > 0)) minutes = Number(order?.pricing?.roadDurationMins)
  if (!(minutes > 0)) return null
  const n = Math.ceil(minutes)
  const unit = n === 1 ? "min" : "mins"
  return eta.target === "restaurant" ? `Rider reaching restaurant in ${n} ${unit}` : `Arriving in ${n} ${unit}`
}

function headline(order, status) {
  if (isDelivered(status)) return "Delivered"
  if (isCancelled(status)) return labelOf(status)
  if (status === "pending_payment") return "Awaiting payment"
  if (status === "created") return "Waiting for the restaurant to confirm"
  const eta = etaLabel(order)
  if (eta) return eta
  if (String(order?.dispatch?.status || "") === "searching") return "Looking for a delivery partner"
  return labelOf(status)
}

const addressText = (a) =>
  a ? a.formattedAddress || [a.additionalDetails, a.street, a.landmark, a.city, a.state, a.zipCode].map((p) => String(p || "").trim()).filter(Boolean).join(", ") : ""

const photoOf = (p) => {
  const v = p?.profilePhoto ?? p?.profileImage ?? p?.avatar
  return typeof v === "string" ? v : v?.url || ""
}

export default function FoodTracking() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const t = useOrderTracking(orderId)
  const { reorder: reorderOrder, sheet: reorderSheet } = useReorder()
  const [expanded, setExpanded] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  // ?confirmed=true is the cart's hand-off; the cart already said "Order placed".
  useEffect(() => {
    if (params.get("confirmed")) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete("confirmed")
          return next
        },
        { replace: true },
      )
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes the full-screen map.
  useEffect(() => {
    if (!expanded) return undefined
    const onKey = (e) => e.key === "Escape" && setExpanded(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [expanded])

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/food/user"))

  if (t.loadStatus === "loading") {
    return (
      <div className="ft">
        <div className="ft-skel" aria-busy="true" aria-label="Loading your order">
          <SkeletonBox height={220} radius={24} />
          <SkeletonBox width={180} height={20} radius={4} />
          <SkeletonBox width={120} height={14} radius={4} />
          <SkeletonBox height={120} radius={18} />
        </div>
      </div>
    )
  }

  if (t.loadStatus === "error") {
    return (
      <div className="ft">
        <div className="ft-errorpage">
          <IconButton label="Back" onClick={back}>
            <ArrowLeft />
          </IconButton>
          <div className="ft-errorpage__body" role="alert">
            <XCircle aria-hidden="true" />
            <p>{t.error}</p>
            <Button block={false} size="md" onClick={t.refresh}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const { order, status } = t
  const restaurantObj = order.restaurantId && typeof order.restaurantId === "object" ? order.restaurantId : null
  const restaurantName = restaurantObj?.restaurantName || order.restaurantName || ""
  const restaurantPos = pointOf(restaurantObj?.location)
  const customerPos = pointOf(order.deliveryAddress?.location) || pointOf(order.deliveryAddress)
  const cancelled = isCancelled(status)
  const delivered = isDelivered(status)
  const showMap = t.active || status === "pending_payment"

  const share = async () => {
    const lines = [
      `My MAAVA order${restaurantName ? ` from ${restaurantName}` : ""}`,
      `Status: ${labelOf(status)}`,
      etaLabel(order),
      `Order ${t.displayId}`,
    ].filter(Boolean)
    try {
      if (navigator.share) await navigator.share({ title: "My MAAVA order", text: lines.join("\n") })
      else {
        await navigator.clipboard.writeText(lines.join("\n"))
        toast.success("Order status copied")
      }
    } catch {
      /* closed the share sheet */
    }
  }

  const reorder = () => reorderOrder(order)

  return (
    <div className="ft">
      {/* ---------------- header ---------------- */}
      <header className="ft-head">
        <div className="ft-head__bar">
          <IconButton label="Back" onClick={back}>
            <ArrowLeft />
          </IconButton>
          <h1>{restaurantName || "Your order"}</h1>
          <IconButton label="Share order status" onClick={share}>
            <Share2 />
          </IconButton>
        </div>
        <div className="ft-head__status" aria-live="polite">
          <p>{headline(order, status)}</p>
          {t.active && (
            <span className="ft-head__bike" aria-hidden="true">
              <Bike />
            </span>
          )}
        </div>
      </header>

      <main className="ft-body">
        {/* ---------------- map ---------------- */}
        {showMap && (
          <>
            {expanded && <div className="ft-mapbackdrop" onClick={() => setExpanded(false)} aria-hidden="true" />}
            <section className={expanded ? "ft-map ft-map--full" : "ft-map"} aria-label="Delivery map" role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined}>
              {expanded && (
                <div className="ft-map__title">
                  <span className="ft-map__titleicon" aria-hidden="true">
                    <Bike />
                  </span>
                  <span className="ft-map__titletext">
                    <b>{t.hasRider ? labelOf(status) : "Tracking your order"}</b>
                    <small>{etaLabel(order) || (t.connected ? "Live tracking active" : "Updating…")}</small>
                  </span>
                  <IconButton label="Close map" onClick={() => setExpanded(false)}>
                    <X />
                  </IconButton>
                </div>
              )}
              <Suspense fallback={<div className="ft-mapview" />}>
                <TrackingMap restaurant={restaurantPos} customer={customerPos} rider={t.riderPos} route={t.route} expanded={expanded} />
              </Suspense>
              {!expanded && (
                <>
                  {t.hasRider && !t.riderPos && (
                    <span className="ft-pill ft-pill--left">
                      <Loader2 className="ft-spin" aria-hidden="true" />
                      Locating your rider
                    </span>
                  )}
                  <button type="button" className="ft-pill ft-pill--right" onClick={() => setExpanded(true)}>
                    <Maximize2 aria-hidden="true" />
                    Expand Map
                  </button>
                </>
              )}
              {expanded && t.hasRider && (
                <div className="ft-map__rider">
                  <Bike aria-hidden="true" />
                  <span>
                    <b>{t.partner?.name || t.partner?.fullName || "Delivery Partner"}</b>
                    <small>{labelOf(status)}</small>
                  </span>
                </div>
              )}
            </section>
          </>
        )}

        {/* ---------------- delivery code ---------------- */}
        {t.otp && (
          <section className="ft-card ft-otp" aria-label="Delivery code">
            <div>
              <small>DELIVERY OTP</small>
              <p>Share this code with your delivery partner</p>
            </div>
            <b className="ft-otp__code">{t.otp}</b>
          </section>
        )}

        {/* ---------------- ended states ---------------- */}
        {cancelled && <CancelledCard order={order} status={status} onReorder={reorder} onHome={() => navigate("/food/user")} />}
        {delivered && <DeliveredCard order={order} mongoId={t.mongoId} partner={t.partner} onRated={t.refresh} onReorder={reorder} />}

        {/* ---------------- rider ---------------- */}
        {t.hasRider && t.partner && <RiderCard partner={t.partner} status={status} />}

        {!cancelled && (
          <section className="ft-card ft-safety">
            <ShieldCheck aria-hidden="true" />
            <p>Your order is protected with MAAVA delivery safety.</p>
          </section>
        )}

        {/* ---------------- delivery details ---------------- */}
        <DeliveryDetails order={order} />

        {/* ---------------- summary ---------------- */}
        <OrderSummary order={order} displayId={t.displayId} />

        {/* ---------------- timeline ---------------- */}
        {!cancelled && <Timeline order={order} status={status} />}

        {/* ---------------- cancel window ---------------- */}
        {status === "created" && <CancelWindow createdAt={order.createdAt} onCancel={() => setCancelOpen(true)} onExpire={t.refresh} />}

        <button type="button" className="ft-help" onClick={() => navigate(`/food/user/help/orders/${encodeURIComponent(t.displayId)}`)}>
          <Headset aria-hidden="true" />
          Need help with this order?
        </button>

        {!t.connected && t.active && (
          <button type="button" className="ft-refresh" onClick={t.refresh}>
            <RefreshCw aria-hidden="true" />
            Refresh status
          </button>
        )}
      </main>

      <CancelSheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        mongoId={t.mongoId}
        onDone={() => {
          setCancelOpen(false)
          t.refresh()
        }}
      />

      {reorderSheet}
    </div>
  )
}

/* ---------------------------------------------------------------- pieces */

function RiderCard({ partner, status }) {
  const name = partner.name || partner.fullName || "Delivery partner"
  const phone = partner.phone || partner.phoneNumber || ""
  const rating = Number(partner.rating) || 0
  const count = Number(partner.totalRatings) || 0
  const vehicle = [partner.vehicleType || partner.vehicleName, partner.vehicleNumber].filter(Boolean).join(" · ")
  const photo = photoOf(partner)
  return (
    <section className="ft-card ft-rider" aria-label="Your delivery partner">
      <div className="ft-rider__row">
        <span className="ft-rider__avatar">{photo ? <img src={photo} alt="" /> : <User aria-hidden="true" />}</span>
        <div className="ft-rider__text">
          <b>{name}</b>
          {(rating > 0 || count > 0) && (
            <span className="ft-rider__rating">
              {rating > 0 && (
                <>
                  <Star aria-hidden="true" />
                  {rating.toFixed(1)}
                </>
              )}
              {count > 0 && <em>{count} ratings</em>}
            </span>
          )}
          <small>{labelOf(status)}</small>
        </div>
        {phone && (
          <a className="ft-rider__call" href={`tel:${phone}`} aria-label={`Call ${name}`}>
            <Phone aria-hidden="true" />
          </a>
        )}
      </div>
      {vehicle && (
        <div className="ft-rider__vehicle">
          <Bike aria-hidden="true" />
          {vehicle}
        </div>
      )}
    </section>
  )
}

function DeliveryDetails({ order }) {
  const a = order.deliveryAddress || {}
  const name = order.customerName || a.name || a.fullName || order.userId?.name || order.userId?.fullName || ""
  const phone = order.customerPhone || a.phone || order.userId?.phone || ""
  const address = addressText(a)
  if (!name && !phone && !address) return null
  const rows = [
    [User, "Delivering to", name],
    [Phone, "Contact", phone],
    [MapPin, "Address", address],
  ].filter(([, , v]) => v)
  return (
    <section className="ft-card" aria-labelledby="ft-dd-h">
      <h2 id="ft-dd-h" className="ft-card__title">
        Delivery details
      </h2>
      <dl className="ft-dd">
        {rows.map(([Icon, label, value]) => (
          <div key={label}>
            <Icon aria-hidden="true" />
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function OrderSummary({ order, displayId }) {
  const items = order.items || []
  const method = order.payment?.method
  return (
    <section className="ft-card" aria-labelledby="ft-sum-h">
      <div className="ft-card__head">
        <h2 id="ft-sum-h" className="ft-card__title">
          Order summary
        </h2>
        <span>#{displayId}</span>
      </div>
      <ul className="ft-items">
        {items.map((it, i) => {
          const qty = Number(it.quantity) || 1
          const extras = [it.variantName, ...(Array.isArray(it.addons) ? it.addons.map((x) => (typeof x === "string" ? x : x?.name)) : [])].filter(Boolean)
          const total = Number(it.itemTotal) || (Number(it.variantPrice ?? it.price) || 0) * qty
          return (
            <li key={`${it.itemId || i}-${it.variantId || ""}`}>
              <b>{qty}×</b>
              <span>
                {it.name}
                {extras.length > 0 && ` (${extras.join(", ")})`}
              </span>
              <em>{rupees(total)}</em>
            </li>
          )
        })}
      </ul>
      <div className="ft-total">
        <span>Total paid</span>
        <b>{rupees(order.pricing?.total)}</b>
      </div>
      {method && <p className="ft-paidvia">Paid via {PAID_VIA[method] || method}</p>}
    </section>
  )
}

function Timeline({ order, status }) {
  const current = STAGES.findIndex(([key]) => key === status || (key === "delivered" && status === "completed"))
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : []
  const at = (key) => (key === "created" ? order.createdAt : history.find((h) => h?.to === key)?.at)
  return (
    <section className="ft-card" aria-labelledby="ft-tl-h">
      <h2 id="ft-tl-h" className="ft-card__title">
        Order status
      </h2>
      <ol className="ft-timeline">
        {STAGES.map(([key, label], i) => {
          const done = current >= 0 && i < current
          const now = i === current
          const Icon = done ? CheckCircle2 : now ? CircleDot : Circle
          const time = done || now ? timeOf(at(key)) : ""
          return (
            <li key={key} className={done ? "is-done" : now ? "is-now" : ""} aria-current={now ? "step" : undefined}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {time && <time>{time}</time>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function CancelWindow({ createdAt, onCancel, onExpire }) {
  const deadline = createdAt ? new Date(createdAt).getTime() + CANCEL_WINDOW_MS : null
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!deadline) return undefined
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [deadline])
  const left = deadline ? Math.max(0, deadline - now) : CANCEL_WINDOW_MS
  useEffect(() => {
    if (deadline && left === 0) onExpire()
  }, [left === 0]) // eslint-disable-line react-hooks/exhaustive-deps
  if (deadline && left === 0) return null
  const secs = Math.ceil(left / 1000)
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`
  return (
    <div className="ft-cancel">
      <p>Cancel order available for {mmss}</p>
      <button type="button" onClick={onCancel}>
        <X aria-hidden="true" />
        Cancel order
      </button>
    </div>
  )
}

function CancelSheet({ open, onClose, mongoId, onDone }) {
  const [reason, setReason] = useState("")
  const [sending, setSending] = useState(false)
  useEffect(() => {
    if (open) setReason("")
  }, [open])
  const confirm = async () => {
    setSending(true)
    try {
      await orderAPI.cancelOrder(mongoId, { reason: reason.trim() })
      toast.success("Order cancelled.")
      onDone()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not cancel this order.")
    } finally {
      setSending(false)
    }
  }
  return (
    <BottomSheet open={open} onClose={onClose} title="Cancel order?">
      <textarea
        className="ft-textarea"
        rows={3}
        maxLength={300}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        aria-label="Reason for cancelling (optional)"
      />
      <div className="ft-sheet-actions">
        <button type="button" className="ft-danger" onClick={confirm} disabled={sending}>
          {sending ? <Loader2 className="ft-spin" aria-label="Cancelling" /> : "Cancel order"}
        </button>
        <Button variant="outline" onClick={onClose}>
          Keep order
        </Button>
      </div>
    </BottomSheet>
  )
}

function CancelledCard({ order, status, onReorder, onHome }) {
  const pay = order.payment || {}
  const refunded = pay.method === "razorpay" && (pay.status === "paid" || pay.status === "refunded")
  return (
    <section className="ft-card ft-ended ft-ended--cancelled" role="status">
      <XCircle aria-hidden="true" />
      <h2>{labelOf(status)}</h2>
      <p>{order.cancellationReason || (status === "cancelled_by_restaurant" ? "The restaurant was unable to accept this order." : "This order has been cancelled.")}</p>
      {refunded && (
        <p className="ft-ended__note">
          Your refund of {rupees(order.pricing?.total)} is being processed and will be credited to your original payment method within 5–7 working days.
        </p>
      )}
      <div className="ft-ended__actions">
        <Button onClick={onReorder}>Order again</Button>
        <Button variant="outline" onClick={onHome}>
          Back to home
        </Button>
      </div>
    </section>
  )
}

function Stars({ value, onChange, label }) {
  return (
    <div className="ft-stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          className={n <= value ? "is-on" : ""}
          disabled={!onChange}
          onClick={() => onChange?.(n)}
        >
          <Star aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

function DeliveredCard({ order, mongoId, partner, onRated, onReorder }) {
  const rated = Number(order.ratings?.restaurant?.rating) || 0
  const [food, setFood] = useState(0)
  const [rider, setRider] = useState(0)
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)
  const riderName = partner?.name || partner?.fullName || ""
  const deliveredAt = timeOf(order.deliveredAt || order.updatedAt)
  const itemCount = useMemo(() => (order.items || []).reduce((n, it) => n + (Number(it.quantity) || 1), 0), [order.items])

  const submit = async () => {
    if (!food) {
      toast.error(partner ? "Please rate both the food and the delivery partner." : "Please rate your food.")
      return
    }
    if (partner && !rider) {
      toast.error("Please rate both the food and the delivery partner.")
      return
    }
    setSending(true)
    try {
      await orderAPI.submitOrderRatings(mongoId, {
        restaurantRating: food,
        ...(partner && rider ? { deliveryPartnerRating: rider } : {}),
        ...(comment.trim() ? { restaurantComment: comment.trim() } : {}),
      })
      toast.success("Thanks for rating your order!")
      onRated()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not submit your rating.")
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="ft-card ft-ended" aria-labelledby="ft-del-h">
      <CheckCircle2 aria-hidden="true" className="ft-ended__ok" />
      <h2 id="ft-del-h">Delivered</h2>
      <p>
        {[deliveredAt, `${itemCount} ${itemCount === 1 ? "Item" : "Items"}`].filter(Boolean).join(" • ")}
        {riderName && ` • by ${riderName}`}
      </p>

      {rated ? (
        <div className="ft-rate">
          <b>Thanks for rating this order</b>
          <Stars value={rated} label="Your food rating" />
        </div>
      ) : (
        <div className="ft-rate">
          <b>How was your food?</b>
          <Stars value={food} onChange={setFood} label="Food rating" />
          {partner && (
            <>
              <b>How was your delivery experience?</b>
              <Stars value={rider} onChange={setRider} label="Delivery partner rating" />
            </>
          )}
          <textarea
            className="ft-textarea"
            rows={2}
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment about the food (optional)"
            aria-label="Comment about the food (optional)"
          />
          <Button onClick={submit} loading={sending} disabled={sending}>
            Submit Rating
          </Button>
        </div>
      )}

      <div className="ft-ended__actions">
        <Button variant="outline" onClick={onReorder}>
          <Store aria-hidden="true" />
          Reorder these items
        </Button>
      </div>
      {partner?.phone && (
        <a className="ft-ended__contact" href={`tel:${partner.phone}`}>
          <Home aria-hidden="true" />
          Order not delivered? Contact Delivery Partner
        </a>
      )}
    </section>
  )
}

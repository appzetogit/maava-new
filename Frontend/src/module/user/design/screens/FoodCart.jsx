import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Banknote,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  CupSoda,
  Gift,
  HandHeart,
  Heart,
  Home,
  IceCreamCone,
  Info,
  LayoutGrid,
  Loader2,
  MapPin,
  Minus,
  Navigation,
  PenLine,
  Percent,
  Pizza,
  Plus,
  Receipt,
  ShieldCheck,
  ShoppingBasket,
  Tag,
  Utensils,
  UtensilsCrossed,
  Wallet,
  Zap,
} from "lucide-react"
import { useProfile } from "../../context/ProfileContext"
import { useLocation as useUserLocation } from "../../hooks/useLocation"
import { useZone } from "../../hooks/useZone"
import { useLocationSelector } from "../../components/UserLayout"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { orderAPI } from "@food/api"
import { BottomSheet, Button, IconButton, SmartImage, toast } from "../index"
import { restaurantPath, toCartItem } from "../data/catalog"
import { useCartActions } from "../data/useCartActions"
import { useRestaurantMenu } from "../data/useRestaurantMenu"
import {
  addressIdOf,
  bodyOf,
  coordsOf,
  messageOf,
  orderItemsFrom,
  pricingForOrder,
  toOrderAddress,
  useFeeSettings,
  useOffers,
  usePricing,
  useStoredAddressId,
  useWalletBalance,
} from "../data/useCheckout"
import { DishSheet } from "./FoodRestaurant"
import "./cart.css"

/**
 * Cart and checkout, rebuilt from presentation/cart/screens/cart_screen.dart.
 * As in the app, Food has no separate checkout: the bill, address, payment
 * method and "Proceed" all live here, and Proceed opens Razorpay directly.
 *
 * Top to bottom: restaurant header; items with steppers and chips (add items,
 * cooking request, cutlery); "Complete your meal with"; free-delivery progress;
 * coupons; tip; bill (collapsed); delivery address; cancellation policy; and a
 * footer with the payment method and the Proceed button.
 *
 * Where the app has gaps, this follows the backend instead: the tip and the
 * cooking request are sent with the order, choosing an address re-prices the
 * bill, a coupon the server rejects is not kept, changed prices are shown, the
 * bill shows its loading and error states, and an order whose online payment
 * can't start is released rather than treated as placed.
 */
const ClassicCart = lazy(() => import("../../pages/cart/Cart"))
const rupees = (n, decimals = 0) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
const money = (n) => rupees(n, Number.isInteger(Number(n)) ? 0 : 2)
const TIP_CAPTIONS = ["Thanks!", "Great!", "Awesome!", "You’re the best!"]
const PAYMENT = {
  razorpay: { icon: CreditCard, label: "Online Payment (UPI/Cards)", cta: "PROCEED TO PAYMENT" },
  cash: { icon: Banknote, label: "Cash on Delivery (COD)", cta: "PLACE COD ORDER" },
  wallet: { icon: Wallet, label: "MAAVA Wallet", cta: "PAY WITH WALLET" },
}
const isMartLine = (line) => line?.restaurantId === "hibermart-id" || String(line?.restaurant || "").trim().toLowerCase() === "hibermart"

export default function FoodCart() {
  const cart = useCartActions()
  const lines = cart.cart || []
  // Mart carts keep the current page: the Mart flow is rebuilt in Phase 4.
  if (lines.length && isMartLine(lines[0])) {
    return (
      <Suspense fallback={null}>
        <ClassicCart />
      </Suspense>
    )
  }
  if (!lines.length) return <EmptyCart />
  return <CartBody cart={cart} lines={lines} />
}

/* ---------------------------------------------------------------- empty */

function EmptyCart() {
  const navigate = useNavigate()
  const categories = [
    ["Meals", UtensilsCrossed, "#FFF0ED", "#EA580C"],
    ["Pizza", Pizza, "#FFF7ED", "#F97316"],
    ["Desserts", IceCreamCone, "#FFF1F2", "#E11D48"],
    ["Beverages", CupSoda, "#F0FDF4", "#16A34A"],
  ]
  return (
    <div className="fc fc--empty">
      <div className="fc-empty">
        <span className="fc-empty__art" aria-hidden="true">
          <ShoppingBasket />
        </span>
        <h1>Your cart is empty</h1>
        <p>
          Looks like you haven&apos;t added anything
          <br />
          to your cart yet.
        </p>
        <Button block={false} className="fc-empty__cta" onClick={() => navigate("/food/user")}>
          Start Shopping
        </Button>
      </div>
      <section className="fc-empty__cats" aria-labelledby="fc-cats">
        <h2 id="fc-cats">Explore popular categories</h2>
        <div className="fc-empty__grid">
          {categories.map(([title, Icon, bg, fg]) => (
            <button key={title} type="button" className="fc-empty__cat" onClick={() => navigate(`/food/user/search?q=${encodeURIComponent(title)}`)}>
              <span style={{ background: bg, color: fg }} aria-hidden="true">
                <Icon />
              </span>
              {title}
            </button>
          ))}
        </div>
      </section>
      <button type="button" className="fc-empty__offer" onClick={() => navigate("/food/user/under-250")}>
        <span className="fc-empty__offer-icon" aria-hidden="true">
          <Percent />
        </span>
        <span>
          <b>Exclusive offers!</b>
          <small>Grab the best deals and save more.</small>
        </span>
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- cart */

function CartBody({ cart, lines }) {
  const navigate = useNavigate()
  const { userProfile, addresses = [], vegMode } = useProfile()
  const { openLocationSelector } = useLocationSelector()

  const restaurantId = String(lines[0].restaurantId || "")
  const restaurantName = String(lines[0].restaurant || "")
  const menu = useRestaurantMenu(restaurantId)
  // Delivery fees, the free-delivery target and tip presets are set per zone.
  const { location } = useUserLocation()
  const { zoneId } = useZone(location)
  const fees = useFeeSettings(zoneId)
  const offers = useOffers(restaurantId, zoneId)
  const walletBalance = useWalletBalance()

  const [storedAddressId, setStoredAddressId] = useStoredAddressId()
  const [coupon, setCoupon] = useState(null)
  const [tip, setTip] = useState(0)
  const [note, setNote] = useState("")
  const [sendCutlery, setSendCutlery] = useState(true)
  const [payment, setPayment] = useState("razorpay")
  const [billOpen, setBillOpen] = useState(false)
  const [sheet, setSheet] = useState(null) // note | coupon | address | payment | tipInfo
  const [sheetDish, setSheetDish] = useState(null)
  const [placing, setPlacing] = useState(false)

  // Selected address, else the account default, else the first saved one.
  const address = useMemo(
    () => addresses.find((a) => addressIdOf(a) === storedAddressId) || addresses.find((a) => a.isDefault) || addresses[0] || null,
    [addresses, storedAddressId],
  )
  const addressId = addressIdOf(address)

  // After "Add new Address", pick the address the customer just saved.
  const waitingForNew = useRef(null)
  useEffect(() => {
    if (waitingForNew.current != null && addresses.length > waitingForNew.current) {
      waitingForNew.current = null
      setStoredAddressId(addressIdOf(addresses[addresses.length - 1]))
    }
  }, [addresses, setStoredAddressId])
  const addNewAddress = () => {
    setSheet(null)
    waitingForNew.current = addresses.length
    openLocationSelector()
  }

  const items = useMemo(() => orderItemsFrom(lines), [lines])
  const bill = usePricing({ items, restaurantId, addressId, coupon, tip })
  const pricing = bill.status === "ready" ? bill.pricing : null
  const localSubtotal = lines.reduce((sum, l) => sum + Number(l.price || 0) * Number(l.quantity || 1), 0)
  const subtotal = pricing ? pricing.subtotal : localSubtotal

  // A coupon the server stopped honouring (cart changed below its minimum) is dropped.
  useEffect(() => {
    if (coupon && pricing && !pricing.couponApplied) {
      setCoupon(null)
      toast.error(`${coupon} no longer applies to this order.`)
    }
  }, [coupon, pricing])

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/food/user"))
  const openRestaurant = () => navigate(restaurantPath({ slug: "", id: restaurantId }))

  /* ------------------------------------------------ coupons */
  const [applying, setApplying] = useState(null)
  const applyCoupon = async (raw) => {
    const code = String(raw || "").trim().toUpperCase()
    if (!code || applying) return
    setApplying(code)
    try {
      const quoted = await bill.quote({ coupon: code })
      if (quoted?.couponApplied) {
        setCoupon(code)
        setSheet(null)
        toast.success(`${code} applied · You saved ${money(quoted.discount)}`)
      } else {
        toast.error("This coupon is not applicable to your order.")
      }
    } catch (err) {
      toast.error(messageOf(err, "This coupon is not applicable to your order."))
    } finally {
      setApplying(null)
    }
  }
  const removeCoupon = () => {
    setCoupon(null)
    setSheet(null)
    toast.success("Coupon removed")
  }

  /* ------------------------------------------------ place order */
  const proceed = async () => {
    if (placing) return
    if (!address) {
      if (addresses.length) {
        toast.error("Please select a delivery address to proceed.")
        setSheet("address")
      } else {
        toast.error("Add a delivery address to place your order.")
        addNewAddress()
      }
      return
    }
    if (!coordsOf(address)) {
      toast.error("This address has no location saved. Please re-select it on the map.")
      return
    }
    if (!pricing) {
      toast.error(bill.error || "Bill not ready. Please try again.")
      return
    }
    if (payment === "wallet" && walletBalance != null && walletBalance < pricing.total) {
      toast.error(`Insufficient wallet balance (${rupees(walletBalance, 2)}). Need ${rupees(pricing.total, 2)}.`)
      return
    }

    setPlacing(true)
    let order
    let razorpay
    try {
      const res = await orderAPI.createOrder({
        items,
        address: toOrderAddress(address, userProfile),
        restaurantId,
        restaurantName: restaurantName || undefined,
        ...(userProfile?.name ? { customerName: String(userProfile.name) } : {}),
        ...(userProfile?.phone ? { customerPhone: String(userProfile.phone) } : {}),
        pricing: pricingForOrder(pricing),
        deliveryMode: "basic",
        ...(note.trim() ? { note: note.trim() } : {}),
        sendCutlery,
        ...(tip > 0 ? { deliveryTip: tip } : {}),
        paymentMethod: payment,
      })
      ;({ order, razorpay } = bodyOf(res))
    } catch (err) {
      setPlacing(false)
      toast.error(messageOf(err, "Could not place your order. Please try again."))
      return
    }

    const mongoId = String(order?._id || order?.orderMongoId || "")
    const displayId = String(order?.orderId || mongoId)
    const finish = (message) => {
      cart.clearCart()
      if (message) toast.success(message)
      navigate(`/food/user/orders/${encodeURIComponent(displayId)}?confirmed=true`, { replace: true })
    }
    const release = () => {
      if (mongoId) orderAPI.abandonOnlinePayment(mongoId).catch(() => {})
    }

    if (payment === "cash") return finish("Order placed with Cash on Delivery")
    if (payment === "wallet") return finish("Order paid using MAAVA Wallet")

    if (!razorpay?.orderId || !razorpay?.key) {
      release()
      setPlacing(false)
      toast.error("Online payment is not available right now. Your order was not charged.")
      return
    }

    let settled = false
    try {
      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount, // already in paise
        currency: razorpay.currency || "INR",
        order_id: razorpay.orderId,
        name: "MAAVA",
        description: "Order payment",
        prefill: {
          name: userProfile?.name || "",
          email: userProfile?.email || "",
          contact: String(userProfile?.phone || address.phone || "").replace(/\D/g, "").slice(-10),
        },
        notes: { orderId: displayId },
        handler: async (resp) => {
          settled = true
          try {
            await orderAPI.verifyPayment({
              orderId: mongoId || displayId,
              razorpayOrderId: resp?.razorpay_order_id,
              razorpayPaymentId: resp?.razorpay_payment_id,
              razorpaySignature: resp?.razorpay_signature,
            })
            finish("Payment successful")
          } catch {
            // The money was taken; the payment webhook confirms the order.
            finish("We are confirming your payment. This can take a moment.")
          }
        },
        onError: (e) => {
          const msg = e?.description || e?.message
          if (msg && e?.code !== "PAYMENT_CANCELLED") toast.error(msg)
        },
        onClose: () => {
          if (settled) return
          settled = true
          release()
          setPlacing(false)
          toast.error("Payment cancelled.")
        },
      })
    } catch {
      if (!settled) {
        settled = true
        release()
        setPlacing(false)
      }
    }
  }

  const method = PAYMENT[payment]
  const logo = menu.restaurant?.imageUrl
  const threshold = fees.freeDeliveryThreshold
  const itemsCount = lines.reduce((n, l) => n + Number(l.quantity || 1), 0)

  return (
    <div className="fc">
      <header className="fc-head">
        <IconButton label="Back" onClick={back}>
          <ArrowLeft />
        </IconButton>
        {restaurantName && (
          <div className="fc-head__rest">
            {logo && (
              <span className="fc-head__logo">
                <SmartImage src={logo} alt="" category="restaurant" />
              </span>
            )}
            <h1>{restaurantName}</h1>
          </div>
        )}
      </header>

      <main className="fc-body">
        {/* ---------------- items ---------------- */}
        <section className="fc-card fc-items" aria-label={`${itemsCount} item${itemsCount === 1 ? "" : "s"} in your cart`}>
          {lines.map((line) => {
            const qty = Number(line.quantity || 1)
            const showVariant = line.variantName && !String(line.name).includes(line.variantName)
            return (
              <div key={line.id} className="fc-line">
                <button type="button" className="fc-line__img" onClick={openRestaurant} aria-label={`Open ${restaurantName || "the restaurant"}`}>
                  {line.image ? <SmartImage src={line.image} alt="" category="food" /> : <Utensils aria-hidden="true" />}
                </button>
                <div className="fc-line__text">
                  <span className="fc-line__name">{line.name}</span>
                  {showVariant && <span className="fc-line__meta">Variant: {line.variantName}</span>}
                </div>
                <div className="fc-stepper" role="group" aria-label={`${line.name} quantity`}>
                  <button type="button" onClick={() => cart.change(line.id, qty - 1)} aria-label={qty === 1 ? `Remove ${line.name}` : `Remove one ${line.name}`}>
                    −
                  </button>
                  <output aria-live="polite">{qty}</output>
                  <button type="button" onClick={() => cart.change(line.id, qty + 1)} aria-label={`Add one more ${line.name}`}>
                    +
                  </button>
                </div>
                <span className="fc-line__total">{rupees(Number(line.price || 0) * qty)}</span>
              </div>
            )
          })}
          <div className="fc-chips">
            <button type="button" className="fc-chip" onClick={openRestaurant}>
              <Plus aria-hidden="true" />
              Add Items
            </button>
            <button type="button" className="fc-chip" aria-pressed={Boolean(note.trim())} onClick={() => setSheet("note")}>
              <PenLine aria-hidden="true" />
              <span className="fc-chip__label">{note.trim() ? `Request: ${note.trim()}` : "Cooking requests"}</span>
            </button>
            <button type="button" className="fc-chip" aria-pressed={!sendCutlery} onClick={() => setSendCutlery((v) => !v)}>
              <Ban aria-hidden="true" />
              {sendCutlery ? "Don't send cutlery" : "No cutlery"}
            </button>
          </div>
        </section>

        {bill.priceChanges.length > 0 && (
          <p className="fc-notice" role="status">
            {bill.priceChanges.length} price{bill.priceChanges.length === 1 ? " has" : "s have"} changed since you added {bill.priceChanges.length === 1 ? "it" : "them"}. The bill below is current.
          </p>
        )}

        {/* ---------------- complete your meal ---------------- */}
        <MealRail
          menu={menu}
          vegMode={vegMode}
          onOpen={(dish) => setSheetDish(dish)}
          onAdd={(dish) => (dish.variants.length ? setSheetDish(dish) : cart.add(toCartItem(dish)))}
        />

        {/* ---------------- free delivery ---------------- */}
        {threshold > 0 && <FreeDeliveryBar threshold={threshold} spent={subtotal} />}

        {/* ---------------- coupon ---------------- */}
        <button type="button" className="fc-card fc-coupon" onClick={() => setSheet("coupon")}>
          <span className="fc-coupon__icon" aria-hidden="true">
            <Tag />
          </span>
          {pricing?.couponApplied && coupon ? (
            <span className="fc-coupon__text fc-coupon__text--on">
              {coupon} applied · You saved {money(pricing.discount)}
            </span>
          ) : (
            <span className="fc-coupon__text">Payment offers &amp; more</span>
          )}
          <ChevronRight aria-hidden="true" />
        </button>

        {/* ---------------- tip ---------------- */}
        <TipCard presets={fees.tipPresets} tip={tip} onTip={(t) => setTip((cur) => (cur === t ? 0 : t))} onInfo={() => setSheet("tipInfo")} />

        {/* ---------------- bill ---------------- */}
        <BillCard bill={bill} pricing={pricing} tip={tip} coupon={coupon} open={billOpen} onToggle={() => setBillOpen((v) => !v)} />

        {/* ---------------- address ---------------- */}
        <section className="fc-card fc-address" aria-labelledby="fc-addr-h">
          <div className="fc-address__head">
            <MapPin aria-hidden="true" />
            <h2 id="fc-addr-h">Delivery Address</h2>
            <button type="button" onClick={() => (addresses.length ? setSheet("address") : addNewAddress())}>
              {addresses.length ? "CHANGE" : "+ ADD"}
            </button>
          </div>
          <button type="button" className="fc-address__box" onClick={() => (addresses.length ? setSheet("address") : addNewAddress())}>
            <span className="fc-address__pin" aria-hidden="true">
              <MapPin />
            </span>
            <span className="fc-address__text">
              <b>{address ? address.label || "Delivery Address" : addresses.length ? "Delivery Address" : "No address added yet"}</b>
              <small>
                {address
                  ? formatAddress(address)
                  : addresses.length
                    ? "Select a delivery address"
                    : "Add a delivery address to see the delivery fee and place your order"}
              </small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        </section>

        <p className="fc-policy">
          <b>Cancellation policy:</b>
          Please double-check your order and address details. Orders are non-refundable once placed.
        </p>
      </main>

      {/* ---------------- footer ---------------- */}
      <footer className="fc-foot">
        <button type="button" className="fc-paymethod" onClick={() => setSheet("payment")}>
          <span className="fc-paymethod__icon" aria-hidden="true">
            <method.icon />
          </span>
          <span className="fc-paymethod__label">
            {payment === "wallet" && walletBalance != null ? `MAAVA Wallet (${rupees(walletBalance)})` : method.label}
          </span>
          <span className="fc-paymethod__change">Change</span>
        </button>
        <button type="button" className="fc-cta" onClick={proceed} disabled={placing || !pricing}>
          {placing ? (
            <Loader2 className="fc-spin" aria-label="Placing your order" />
          ) : (
            <>
              <span>
                {method.cta} {pricing ? `(${money(pricing.total)})` : ""}
              </span>
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </button>
      </footer>

      {/* ---------------- sheets ---------------- */}
      <NoteSheet open={sheet === "note"} value={note} onClose={() => setSheet(null)} onSave={(v) => { setNote(v.trim()); setSheet(null) }} />

      <BottomSheet open={sheet === "coupon"} onClose={() => setSheet(null)} title="Apply Coupon">
        <CouponSheetBody
          offers={offers}
          subtotal={subtotal}
          applied={pricing?.couponApplied && coupon ? { code: coupon, discount: pricing.discount } : null}
          applying={applying}
          onApply={applyCoupon}
          onRemove={removeCoupon}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "address"} onClose={() => setSheet(null)} title="Choose a delivery address">
        <div className="fc-addrlist">
          <button type="button" className="fc-addrlist__new" onClick={addNewAddress}>
            <span aria-hidden="true">
              <Plus />
            </span>
            Add new Address
          </button>
          {addresses.length === 0 && <p className="fc-muted">No saved addresses yet. Add one to continue.</p>}
          {addresses.map((a) => {
            const id = addressIdOf(a)
            const selected = id === addressId
            const Icon = a.label === "Home" ? Home : a.label === "Office" ? Briefcase : Navigation
            return (
              <button
                key={id || formatAddress(a)}
                type="button"
                className="fc-addrlist__row"
                aria-pressed={selected}
                onClick={() => {
                  setStoredAddressId(id)
                  setSheet(null)
                }}
              >
                <span className="fc-addrlist__icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="fc-addrlist__text">
                  <b>
                    {a.label || "Address"}
                    {selected && <em>Selected</em>}
                  </b>
                  <small>{formatAddress(a)}</small>
                </span>
              </button>
            )
          })}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "payment"} onClose={() => setSheet(null)} title="Select Payment Method">
        <p className="fc-muted">Total Payable Amount: {pricing ? rupees(pricing.total, 2) : "—"}</p>
        <div className="fc-payopts" role="radiogroup" aria-label="Payment method">
          {[
            ["razorpay", CreditCard, "Online Payment (UPI, Cards, NetBanking)", "Pay securely via Razorpay payment gateway", null],
            ["cash", Banknote, "Cash on Delivery (COD)", "Pay in cash when your food is delivered", null],
            [
              "wallet",
              Wallet,
              "MAAVA Wallet",
              walletBalance == null
                ? "Balance unavailable right now"
                : pricing && walletBalance < pricing.total
                  ? `Balance: ${rupees(walletBalance, 2)} (Insufficient balance)`
                  : `Available balance: ${rupees(walletBalance, 2)}`,
              walletBalance == null ? null : pricing && walletBalance < pricing.total ? ["LOW BALANCE", "low"] : ["INSTANT", "ok"],
            ],
          ].map(([id, Icon, title, sub, badge]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={payment === id}
              className="fc-payopt"
              onClick={() => {
                setPayment(id)
                setSheet(null)
              }}
            >
              <span className="fc-payopt__icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="fc-payopt__text">
                <b>
                  {title}
                  {badge && <em className={`fc-badge fc-badge--${badge[1]}`}>{badge[0]}</em>}
                </b>
                <small>{sub}</small>
              </span>
              <span className="fc-radio" aria-hidden="true" />
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "tipInfo"} onClose={() => setSheet(null)}>
        <div className="fc-tipinfo">
          <span className="fc-tipinfo__icon" aria-hidden="true">
            <HandHeart />
          </span>
          <h2>100% of your tip goes to your delivery partner</h2>
          <p>
            MAAVA does not deduct any transaction fees or commissions from delivery tips. Your full contribution is transferred directly to the
            delivery executive as appreciation for their hard work and care.
          </p>
          <button type="button" className="fc-tipinfo__ok" onClick={() => setSheet(null)}>
            Got it
          </button>
        </div>
      </BottomSheet>

      <DishSheet
        dish={sheetDish}
        onClose={() => setSheetDish(null)}
        onConfirm={(dish, variant, qty) => {
          setSheetDish(null)
          cart.add(toCartItem(dish, variant), qty)
        }}
      />
    </div>
  )
}

function formatAddress(a) {
  const parts = [a.additionalDetails, a.street, a.city, a.state, a.zipCode].map((p) => String(p || "").trim()).filter(Boolean)
  return a.formattedAddress || [...new Set(parts)].join(", ")
}

/* ---------------------------------------------------------------- pieces */

function MealRail({ menu, vegMode, onOpen, onAdd }) {
  const [tab, setTab] = useState("popular")
  const tabs = useMemo(() => {
    const ok = (d) => d.isAvailable && (!vegMode || d.isVeg)
    const all = menu.sections.flatMap((s) => s.items).filter(ok)
    const popular = all.filter((d) => d.isPopular)
    const biggest = [...menu.sections].sort((a, b) => b.items.length - a.items.length).slice(0, 2)
    return [
      { id: "popular", name: "Popular", items: (popular.length ? popular : all).slice(0, 12) },
      ...biggest.map((s) => ({ id: s.id, name: s.name, items: s.items.filter(ok).slice(0, 12) })),
    ].filter((t) => t.items.length > 0)
  }, [menu.sections, vegMode])

  if (menu.status === "loading") return <div className="fc-card fc-rail fc-rail--loading" aria-hidden="true" />
  if (!tabs.length) return null
  const current = tabs.find((t) => t.id === tab) || tabs[0]

  return (
    <section className="fc-card fc-rail" aria-labelledby="fc-rail-h">
      <div className="fc-rail__head">
        <span aria-hidden="true">
          <LayoutGrid />
        </span>
        <h2 id="fc-rail-h">Complete your meal with</h2>
      </div>
      {tabs.length > 1 && (
        <div className="fc-rail__tabs" role="tablist" aria-label="Suggestions">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === current.id} onClick={() => setTab(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="fc-rail__list" role="tabpanel">
        {current.items.map((dish) => (
          <article key={dish.id} className="fc-rail__item">
            <div className="fc-rail__media">
              <button type="button" className="fc-rail__img" onClick={() => onOpen(dish)} aria-label={`About ${dish.name}`}>
                <SmartImage src={dish.image} alt="" category="food" />
              </button>
              <span className={dish.isVeg ? "fc-veg" : "fc-veg fc-veg--non"} role="img" aria-label={dish.isVeg ? "Veg" : "Non-veg"}>
                <i />
              </span>
              <button type="button" className="fc-rail__add" onClick={() => onAdd(dish)} aria-label={`Add ${dish.name}`}>
                <Plus aria-hidden="true" />
              </button>
            </div>
            <span className="fc-rail__name">{dish.name}</span>
            <span className="fc-rail__price">{rupees(dish.variants.length ? Math.min(...dish.variants.map((v) => v.price)) : dish.price)}</span>
          </article>
        ))}
      </div>
    </section>
  )
}

function FreeDeliveryBar({ threshold, spent }) {
  const remaining = Math.max(0, Math.ceil(threshold - spent))
  const unlocked = remaining === 0
  const pct = Math.min(100, (spent / threshold) * 100)
  return (
    <section className="fc-free" aria-live="polite">
      <div className="fc-free__title">
        <Zap aria-hidden="true" />
        {unlocked ? "You unlocked FREE delivery" : "Get FREE delivery"}
      </div>
      <p>{unlocked ? "No delivery charge on this order" : `Add products worth ${rupees(remaining)} more`}</p>
      <div className="fc-free__track" role="progressbar" aria-valuemin={0} aria-valuemax={threshold} aria-valuenow={Math.min(spent, threshold)} aria-label="Progress to free delivery">
        <span style={{ width: `${pct}%` }} />
      </div>
    </section>
  )
}

function TipCard({ presets, tip, onTip, onInfo }) {
  return (
    <section className="fc-card fc-tip" aria-labelledby="fc-tip-h">
      <div className="fc-tip__head">
        <span className="fc-tip__art" aria-hidden="true">
          <HandHeart />
          <Heart className="fc-tip__heart" />
        </span>
        <div className="fc-tip__titles">
          <h2 id="fc-tip-h">Tip your delivery partner</h2>
          <button type="button" onClick={onInfo}>
            100% of your tip goes to them
            <Info aria-hidden="true" />
          </button>
        </div>
        <span className="fc-tip__badge">
          <ShieldCheck aria-hidden="true" />
          They deliver with care, you tip with kindness 💜
        </span>
      </div>
      <div className="fc-tip__chips" role="radiogroup" aria-label="Tip amount">
        {presets.map((amount, i) => (
          <button key={amount} type="button" role="radio" aria-checked={tip === amount} className="fc-tip__chip" onClick={() => onTip(amount)}>
            <b>₹{amount}</b>
            <small>{TIP_CAPTIONS[Math.min(i, TIP_CAPTIONS.length - 1)]}</small>
            {tip === amount && (
              <span className="fc-tip__check" aria-hidden="true">
                <Check />
              </span>
            )}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={tip === 0} className="fc-tip__chip fc-tip__chip--none" onClick={() => onTip(0)}>
          <Ban aria-hidden="true" />
          <small>No Tip</small>
          {tip === 0 && (
            <span className="fc-tip__check" aria-hidden="true">
              <Check />
            </span>
          )}
        </button>
      </div>
      <div className="fc-tip__foot">
        <Gift aria-hidden="true" />
        <span>Your kindness motivates them to do better every day! 💜</span>
        <button type="button" onClick={onInfo}>
          Learn more ›
        </button>
      </div>
    </section>
  )
}

function BillCard({ bill, pricing, tip, coupon, open, onToggle }) {
  const loading = bill.status === "loading" || bill.status === "idle"
  return (
    <section className="fc-card fc-bill">
      <button type="button" className="fc-bill__head" aria-expanded={open} aria-controls="fc-bill-rows" onClick={onToggle}>
        <span className="fc-bill__icon" aria-hidden="true">
          <Receipt />
        </span>
        <span className="fc-bill__titles">
          <small>Bill Details</small>
          <b>
            To Pay{"  "}
            {pricing ? money(pricing.total) : loading ? <span className="fc-shimmer" aria-label="Calculating" /> : "—"}
          </b>
        </span>
        <span className="fc-bill__side">
          <em>Incl. taxes</em>
          <ChevronDown aria-hidden="true" className={open ? "fc-rot" : undefined} />
        </span>
      </button>

      {bill.status === "error" && (
        <div className="fc-bill__error" role="alert">
          <span>{bill.error}</span>
          <button type="button" onClick={bill.retry}>
            Try again
          </button>
        </div>
      )}

      {open && pricing && (
        <dl id="fc-bill-rows" className="fc-bill__rows">
          <Row label="Item Total" value={rupees(pricing.subtotal)} />
          <Row label="Delivery Fee" value={pricing.deliveryFee === 0 ? "FREE" : money(pricing.deliveryFee)} good={pricing.deliveryFee === 0} />
          {/* The distance and the sum behind the fee, as the server worked it out --
              identical for online and cash-on-delivery orders. */}
          {pricing.deliveryFeeBreakdown?.message && (
            <p className="fc-bill__note">{pricing.deliveryFeeBreakdown.message}</p>
          )}
          <Row label="Platform Fee" value={money(pricing.platformFee)} />
          {pricing.packagingFee > 0 && <Row label="Packing Charges" value={money(pricing.packagingFee)} />}
          {pricing.tax > 0 && <Row label={`GST (${pricing.gstRate || 5}%)`} value={rupees(pricing.tax, 2)} />}
          {pricing.deliveryFeeGst > 0 && <Row label={`Taxes (${pricing.deliveryFeeGstRate || 18}%)`} value={rupees(pricing.deliveryFeeGst, 2)} />}
          {(pricing.deliveryTip || tip) > 0 && <Row label="Delivery Partner Tip" value={money(pricing.deliveryTip || tip)} />}
          {pricing.discount > 0 && <Row label={coupon ? "Coupon Discount" : "Discount"} value={`−${money(pricing.discount)}`} good />}
          <div className="fc-bill__total">
            <dt>Grand Total</dt>
            <dd>{money(pricing.total)}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}

function Row({ label, value, good }) {
  return (
    <div className={good ? "fc-bill__row fc-bill__row--good" : "fc-bill__row"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function NoteSheet({ open, value, onClose, onSave }) {
  const [text, setText] = useState(value)
  useEffect(() => {
    if (open) setText(value)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <BottomSheet open={open} onClose={onClose} title="Cooking requests">
      <textarea
        className="fc-textarea"
        rows={3}
        maxLength={300}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Make it less spicy, no onions..."
        aria-label="Cooking request for the restaurant"
      />
      <Button className="fc-sheet-btn" onClick={() => onSave(text)}>
        Save Request
      </Button>
    </BottomSheet>
  )
}

function CouponSheetBody({ offers, subtotal, applied, applying, onApply, onRemove }) {
  const [code, setCode] = useState("")
  return (
    <div className="fc-coupons">
      {applied && (
        <div className="fc-coupons__applied">
          <Check aria-hidden="true" />
          <span>
            {applied.code} applied · You saved {money(applied.discount)}
          </span>
          <button type="button" onClick={onRemove}>
            REMOVE
          </button>
        </div>
      )}
      <form
        className="fc-coupons__entry"
        onSubmit={(e) => {
          e.preventDefault()
          onApply(code)
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter coupon code"
          aria-label="Coupon code"
          autoCapitalize="characters"
        />
        <button type="submit" disabled={!code.trim() || Boolean(applying)}>
          {applying && applying === code.trim().toUpperCase() ? <Loader2 className="fc-spin" aria-label="Applying" /> : "APPLY"}
        </button>
      </form>
      {offers.status === "loading" ? (
        <p className="fc-muted">Loading coupons…</p>
      ) : offers.list.length === 0 ? (
        <p className="fc-muted">No eligible coupon found.</p>
      ) : (
        <ul className="fc-coupons__list">
          {offers.list.map((o) => {
            const short = o.minOrder > 0 && subtotal < o.minOrder
            return (
              <li key={o.id} className={short ? "fc-coupons__tile fc-coupons__tile--off" : "fc-coupons__tile"}>
                <div>
                  <b>{o.code}</b>
                  {o.title && <small>{o.title}</small>}
                  {short && <em>Min order {rupees(o.minOrder)}</em>}
                </div>
                <button type="button" disabled={short || Boolean(applying)} onClick={() => onApply(o.code)}>
                  {applying === o.code ? <Loader2 className="fc-spin" aria-label="Applying" /> : "APPLY"}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

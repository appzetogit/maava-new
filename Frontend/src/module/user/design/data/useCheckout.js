import { useCallback, useEffect, useRef, useState } from "react"
import { adminAPI, orderAPI, restaurantAPI, userAPI } from "@food/api"
import { resolveImageSrc } from "../components/media"

/**
 * Pricing, fees, offers and wallet for the cart, speaking the backend's order
 * contract directly (the same one the app uses, data/datasources/order_remote_datasource.dart).
 *
 * The server is the only source of prices: /food/orders/calculate quotes the
 * bill, and /food/orders re-prices from the items, pricing.couponCode and
 * deliveryTip. So the page shows the server's numbers, not local guesses, and
 * never lets an order go out on a bill that failed to load.
 */
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
export const bodyOf = (res) => res?.data?.data ?? res?.data ?? {}

export const messageOf = (err, fallback) => {
  const data = err?.response?.data
  if (typeof data?.message === "string" && data.message) return data.message
  if (typeof data?.error === "string" && data.error) return data.error
  if (err?.code === "ERR_NETWORK") return "No internet connection."
  if (err?.code === "ECONNABORTED") return "The request timed out. Please try again."
  return fallback
}

/** Cart lines -> order items. A sized dish refers to the dish (foodId) and names its size. */
export const orderItemsFrom = (lines) =>
  lines.map((line) => {
    const image = resolveImageSrc(line.image || line.imageUrl)
    return {
      itemId: String(line.foodId || line.id),
      name: String(line.name || "Item"),
      price: num(line.price),
      quantity: Math.max(1, Math.round(num(line.quantity) || 1)),
      isVeg: line.isVeg !== false,
      ...(image ? { image } : {}),
      ...(line.variantId
        ? { variantId: String(line.variantId), variantName: String(line.variantName || ""), variantPrice: num(line.variantPrice ?? line.price) }
        : {}),
    }
  })

export function normalizePricing(p) {
  if (!p || typeof p !== "object") return null
  const discount = num(p.discount ?? p.discountAmount ?? p.couponDiscount)
  const code = p.appliedCoupon?.code || p.couponCode || null
  return {
    subtotal: num(p.subtotal),
    tax: num(p.tax),
    gstRate: num(p.gstRate),
    packagingFee: num(p.packagingFee),
    deliveryFee: num(p.deliveryFee),
    deliveryFeeGst: num(p.deliveryFeeGst),
    deliveryFeeGstRate: num(p.deliveryFeeGstRate),
    platformFee: num(p.platformFee),
    discount,
    deliveryTip: num(p.deliveryTip ?? p.tip),
    total: num(p.total ?? p.finalAmount ?? p.totalPayable),
    currency: p.currency || "INR",
    // The server echoes the requested code even when it didn't apply; a coupon
    // counts only when it came back as appliedCoupon or actually discounted.
    couponApplied: Boolean(p.appliedCoupon?.code) || (Boolean(p.couponCode) && discount > 0),
    couponCode: code,
    // Why delivery costs what it does; 'new_customer' means the welcome waived it.
    deliveryFeeReason: p.deliveryFeeReason || null,
    newCustomerFreeDelivery: p.newCustomerFreeDelivery || null,
  }
}

/** The pricing block /food/orders validates: numbers only, coupon only when it applied. */
export const pricingForOrder = (p) => ({
  subtotal: p.subtotal,
  tax: p.tax,
  packagingFee: p.packagingFee,
  deliveryFee: p.deliveryFee,
  platformFee: p.platformFee,
  discount: p.discount,
  total: p.total,
  currency: p.currency,
  ...(p.couponApplied && p.couponCode ? { couponCode: p.couponCode } : {}),
})

export const addressIdOf = (a) => (a ? String(a._id || a.id || "") : "")

export function coordsOf(a) {
  if (!a) return null
  const lat = Number(a.latitude ?? a.lat ?? a.location?.coordinates?.[1])
  const lng = Number(a.longitude ?? a.lng ?? a.location?.coordinates?.[0])
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null
}

/** A saved address in the shape /food/orders validates (label must be Home, Office or Other). */
export function toOrderAddress(a, profile) {
  const c = coordsOf(a)
  return {
    label: ["Home", "Office", "Other"].includes(a.label) ? a.label : "Other",
    ...(profile?.name ? { name: String(profile.name) } : {}),
    street: String(a.street || a.formattedAddress || a.address || ""),
    additionalDetails: String(a.additionalDetails || ""),
    city: String(a.city || ""),
    state: String(a.state || ""),
    zipCode: String(a.zipCode || a.postalCode || ""),
    phone: String(a.phone || profile?.phone || ""),
    ...(c ? { location: { type: "Point", coordinates: [c.lng, c.lat] } } : {}),
  }
}

const buildQuote = ({ items, restaurantId, addressId, coupon, tip }) => ({
  items,
  restaurantId,
  ...(addressId ? { deliveryAddressId: addressId } : {}),
  ...(coupon ? { couponCode: coupon } : {}),
  deliveryMode: "basic",
  ...(tip > 0 ? { deliveryTip: tip } : {}),
})

/**
 * The bill. Re-quoted whenever the lines, address, coupon or tip change;
 * a short pause folds quick stepper taps into one request, and a response
 * that arrives after a newer request is dropped.
 */
export function usePricing({ items, restaurantId, addressId, coupon, tip }) {
  const [state, setState] = useState({ status: "idle", pricing: null, priceChanges: [], error: null })
  const [nonce, setNonce] = useState(0)
  const seq = useRef(0)
  const params = { items, restaurantId, addressId, coupon, tip }
  const key = JSON.stringify(params)
  const latest = useRef(params)
  latest.current = params

  useEffect(() => {
    if (!items.length || !restaurantId) {
      setState({ status: "idle", pricing: null, priceChanges: [], error: null })
      return undefined
    }
    const req = ++seq.current
    setState((s) => ({ ...s, status: "loading", error: null }))
    const timer = setTimeout(async () => {
      try {
        const body = bodyOf(await orderAPI.calculateOrder(buildQuote(latest.current)))
        if (req !== seq.current) return
        const pricing = normalizePricing(body.pricing)
        setState({
          status: pricing ? "ready" : "error",
          pricing,
          priceChanges: Array.isArray(body.priceChanges) ? body.priceChanges : [],
          error: pricing ? null : "Could not calculate your bill.",
        })
      } catch (err) {
        if (req !== seq.current) return
        setState({ status: "error", pricing: null, priceChanges: [], error: messageOf(err, "Could not calculate your bill.") })
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [key, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  /** A one-off quote with changes (used to test a coupon before keeping it). */
  const quote = useCallback(async (overrides) => {
    const body = bodyOf(await orderAPI.calculateOrder(buildQuote({ ...latest.current, ...overrides })))
    return normalizePricing(body.pricing)
  }, [])

  const retry = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, quote, retry }
}

const DEFAULT_TIPS = [10, 20, 30, 50]

// zoneId: fees can differ per delivery zone, so the tip presets and the
// free-delivery target follow the area the order is going to.
export function useFeeSettings(zoneId = null) {
  const [fees, setFees] = useState({ freeDeliveryThreshold: 0, tipPresets: DEFAULT_TIPS })
  useEffect(() => {
    let alive = true
    adminAPI
      .getPublicFeeSettings(zoneId ? { params: { zoneId } } : {})
      .then((res) => {
        const body = bodyOf(res)
        const s = body.feeSettings ?? body
        const tips = [...new Set((Array.isArray(s?.tipPresets) ? s.tipPresets : []).map(Number).filter((n) => Number.isFinite(n) && n > 0))]
        if (alive) setFees({ freeDeliveryThreshold: num(s?.freeDeliveryThreshold), tipPresets: tips.length ? tips : DEFAULT_TIPS })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [zoneId])
  return fees
}

export function useOffers(restaurantId, zoneId = null) {
  const [offers, setOffers] = useState({ status: "loading", list: [] })
  useEffect(() => {
    if (!restaurantId) return undefined
    let alive = true
    restaurantAPI
      .getPublicOffers({ restaurantId, ...(zoneId ? { zoneId } : {}) })
      .then((res) => {
        const body = bodyOf(res)
        const raw = Array.isArray(body.allOffers) ? body.allOffers : Array.isArray(body.offers) ? body.offers : []
        const now = Date.now()
        const list = raw
          .filter((o) => o?.couponCode && (!o.endDate || new Date(o.endDate).getTime() > now))
          .map((o) => ({
            id: String(o.id || o.offerId || o._id || o.couponCode),
            code: String(o.couponCode).toUpperCase(),
            title: String(o.title || o.description || ""),
            minOrder: num(o.minOrderValue),
          }))
        if (alive) setOffers({ status: "ready", list: [...new Map(list.map((o) => [o.code, o])).values()] })
      })
      .catch(() => alive && setOffers({ status: "error", list: [] }))
    return () => {
      alive = false
    }
  }, [restaurantId, zoneId])
  return offers
}

export function useWalletBalance() {
  const [balance, setBalance] = useState(null)
  useEffect(() => {
    let alive = true
    userAPI
      .getWallet()
      .then((res) => {
        const b = Number(bodyOf(res)?.wallet?.balance)
        if (alive) setBalance(Number.isFinite(b) ? b : 0)
      })
      .catch(() => alive && setBalance(null))
    return () => {
      alive = false
    }
  }, [])
  return balance
}

/** The chosen delivery address, remembered on this device. */
const ADDRESS_KEY = "mv.deliveryAddressId"
export function useStoredAddressId() {
  const [id, setId] = useState(() => {
    try {
      return localStorage.getItem(ADDRESS_KEY) || ""
    } catch {
      return ""
    }
  })
  const choose = useCallback((next) => {
    setId(next || "")
    try {
      if (next) localStorage.setItem(ADDRESS_KEY, next)
      else localStorage.removeItem(ADDRESS_KEY)
    } catch {
      /* keep it for this visit */
    }
  }, [])
  return [id, choose]
}

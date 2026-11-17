import { useCallback, useState } from "react"
import { useCart } from "../../context/CartContext"

/**
 * Adding to the cart safely from rebuilt screens.
 *
 * The cart refuses items from a second restaurant by throwing inside a React
 * state update, where no caller can catch it -- it surfaces as a crash. So the
 * check happens here first; a clash is held as `pending` for the screen to ask
 * "Start a new cart?". Mart items never clash: the cart swaps between Mart and
 * Food on its own.
 */
const norm = (v) => String(v || "").trim().toLowerCase()
const isMart = (item) => item?.restaurantId === "hibermart-id" || norm(item?.restaurant) === "hibermart"
const sameRestaurant = (a, b) =>
  norm(a.restaurant) && norm(b.restaurant) ? norm(a.restaurant) === norm(b.restaurant) : String(a.restaurantId || "") === String(b.restaurantId || "")

export function useCartActions() {
  const cartApi = useCart()
  const { cart = [], addToCart, updateQuantity, removeFromCart, getCartItem, clearCart } = cartApi
  const [pending, setPending] = useState(null)

  const quantityOf = useCallback((lineId) => getCartItem?.(lineId)?.quantity || 0, [getCartItem])

  /** Total across every line for one dish (all its sizes). */
  const dishQuantity = useCallback(
    (foodId) => cart.filter((line) => (line.foodId || line.id) === foodId).reduce((n, line) => n + (line.quantity || 0), 0),
    [cart],
  )

  // Both cart calls queue functional state updates, so an add followed by a
  // quantity change in the same tick applies in order.
  const put = useCallback(
    (item, qty) => {
      const existing = getCartItem?.(item.id)
      if (existing) updateQuantity(item.id, (existing.quantity || 0) + qty)
      else {
        addToCart(item)
        if (qty > 1) updateQuantity(item.id, qty)
      }
    },
    [addToCart, updateQuantity, getCartItem],
  )

  /** Adds `qty` of an item; returns false when it's held for "Start a new cart?". */
  const add = useCallback(
    (item, qty = 1) => {
      const first = cart[0]
      if (first && !isMart(first) && !isMart(item) && !sameRestaurant(first, item)) {
        setPending({ item, qty })
        return false
      }
      put(item, qty)
      return true
    },
    [cart, put],
  )

  const change = useCallback(
    (lineId, next) => {
      if (next <= 0) removeFromCart(lineId)
      else updateQuantity(lineId, next)
    },
    [removeFromCart, updateQuantity],
  )

  const confirmReplace = useCallback(() => {
    const held = pending
    setPending(null)
    if (!held) return
    clearCart()
    addToCart(held.item)
    if (held.qty > 1) updateQuantity(held.item.id, held.qty)
  }, [pending, clearCart, addToCart, updateQuantity])

  return {
    ...cartApi,
    quantityOf,
    dishQuantity,
    add,
    change,
    pending: pending?.item || null,
    confirmReplace,
    cancelReplace: () => setPending(null),
    cartRestaurantName: cart[0]?.restaurant || "another restaurant",
  }
}

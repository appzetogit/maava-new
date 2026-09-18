import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { BottomSheet, Button } from "../index"
import { useCartActions } from "./useCartActions"

/**
 * "Reorder" from a past order: put its items back in the cart and open it.
 * Prices are re-quoted by the cart, which shows any that changed. A cart from
 * another restaurant asks first (the cart holds one restaurant at a time).
 */
const norm = (v) => String(v || "").trim().toLowerCase()

function linesFor(order) {
  const r = order?.restaurantId && typeof order.restaurantId === "object" ? order.restaurantId : null
  const restaurantId = String(r?._id || order?.restaurantId || "")
  const restaurant = String(r?.restaurantName || order?.restaurantName || "")
  const lines = (order?.items || []).map((it) => {
    const vid = it.variantId ? String(it.variantId) : ""
    const unit = Number(it.variantPrice ?? it.price) || 0
    return {
      id: vid ? `${it.itemId}__${vid}` : String(it.itemId),
      foodId: String(it.itemId),
      name: String(it.name || "Item"),
      price: unit,
      image: typeof it.image === "string" ? it.image : "",
      restaurant,
      restaurantId,
      isVeg: it.isVeg !== false,
      ...(vid ? { variantId: vid, variantName: String(it.variantName || ""), variantPrice: unit } : {}),
      qty: Math.max(1, Number(it.quantity) || 1),
    }
  })
  return { lines, restaurant, restaurantId }
}

export function useReorder() {
  const cart = useCartActions()
  const navigate = useNavigate()
  const [pending, setPending] = useState(null)

  const fill = (lines, replace) => {
    if (replace) cart.clearCart()
    lines.forEach(({ qty, ...line }) => {
      const existing = !replace && cart.getCartItem?.(line.id)
      if (existing) cart.updateQuantity(line.id, (existing.quantity || 0) + qty)
      else {
        cart.addToCart(line)
        if (qty > 1) cart.updateQuantity(line.id, qty)
      }
    })
    navigate("/food/user/cart")
  }

  const reorder = (order) => {
    const { lines, restaurant, restaurantId } = linesFor(order)
    if (!lines.length) return
    const first = cart.cart?.[0]
    const same = !first || (norm(first.restaurant) && norm(restaurant) ? norm(first.restaurant) === norm(restaurant) : String(first.restaurantId) === restaurantId)
    if (same) fill(lines, false)
    else setPending(lines)
  }

  const sheet = (
    <BottomSheet open={Boolean(pending)} onClose={() => setPending(null)} title="Replace cart?">
      <p className="mv-body-medium">Your cart contains items from another restaurant. Would you like to clear it and add this order&apos;s items instead?</p>
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <Button
          onClick={() => {
            const lines = pending
            setPending(null)
            fill(lines, true)
          }}
        >
          Replace Cart
        </Button>
        <Button variant="outline" onClick={() => setPending(null)}>
          Cancel
        </Button>
      </div>
    </BottomSheet>
  )

  return { reorder, sheet }
}

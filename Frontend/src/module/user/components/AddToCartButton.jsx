import { Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "../context/CartContext"

export default function AddToCartButton({ item, className = "", disabled = false }) {
  const { addToCart, isInCart, getCartItem, updateQuantity } = useCart()
  const inCart = isInCart(item.id)
  const cartItem = getCartItem(item.id)

  const getSourcePosition = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      viewportX: rect.left + rect.width / 2,
      viewportY: rect.top + rect.height / 2,
      scrollX: window.pageXOffset || window.scrollX || 0,
      scrollY: window.pageYOffset || window.scrollY || 0,
      itemId: item.id,
    }
  }

  const handleAddToCart = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    const sourcePosition = getSourcePosition(e)
    addToCart(item, sourcePosition)
  }

  const handleIncrease = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    const sourcePosition = getSourcePosition(e)
    updateQuantity(item.id, (cartItem?.quantity || 0) + 1, sourcePosition, item)
  }

  const handleDecrease = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    const sourcePosition = getSourcePosition(e)
    updateQuantity(item.id, (cartItem?.quantity || 0) - 1, sourcePosition, item)
  }

  if (inCart) {
    return (
      <div className={`flex items-center ${className}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        <div className={`flex items-center gap-0.5 border rounded-lg overflow-hidden h-7 bg-white dark:bg-black/20 ${disabled ? "border-gray-300 opacity-50" : "border-green-600"}`}>
          <Button
            variant="ghost"
            size="icon"
            className={`h-full w-6 rounded-none transition-colors ${disabled ? "text-gray-400 cursor-not-allowed" : "text-green-600 hover:bg-green-50"}`}
            onClick={handleIncrease}
            disabled={disabled}
          >
            <Plus className="h-3 w-3" strokeWidth={3} />
          </Button>
          <span className={`px-1 text-[11px] font-bold min-w-[1rem] text-center ${disabled ? "text-gray-400" : "text-green-600"}`}>
            {cartItem?.quantity || 0}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className={`h-full w-6 rounded-none transition-colors ${disabled ? "text-gray-400 cursor-not-allowed" : "text-green-600 hover:bg-green-50"}`}
            onClick={handleDecrease}
            disabled={disabled}
          >
            <Minus className="h-3 w-3" strokeWidth={3} />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      onClick={handleAddToCart}
      disabled={disabled}
      className={`h-7 px-2 sm:px-2.5 font-black rounded-lg text-[9px] sm:text-[10px] transition-all transform active:scale-95 shadow-sm ${disabled
        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-70"
        : "bg-white dark:bg-transparent border border-green-600 text-green-600 hover:bg-green-600 hover:text-white"
        } ${className}`}
    >
      ADD
    </Button>
  )
}
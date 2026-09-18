import { Link, useLocation } from "react-router-dom"
import { ChevronUp } from "lucide-react"
import { useCart } from "../context/CartContext"
import { motion, AnimatePresence } from "framer-motion"
import { useScrollDirection } from "../hooks/useScrollDirection"

export default function CartSummaryBar() {
    const { cart, itemCount } = useCart()
    const scrollDirection = useScrollDirection()
    const location = useLocation()

    if (itemCount === 0) return null

    // Check cart type and page type
    const isHibermartCart = cart[0]?.restaurantId === 'hibermart-id' || cart[0]?.restaurant === 'Hibermart'
    const isHibermartPage = location.pathname.startsWith("/in-mart") || location.pathname.startsWith("/food/user/in-mart")
    const isSearchPage = location.pathname.includes("/search")

    // Logic: 
    // 1. Hide Hibermart cart on non-Hibermart pages (like Home, Under 250)
    // 2. Hide Food cart on Hibermart pages.
    // 3. Search page can show either.
    if (!isSearchPage) {
        if (isHibermartCart && !isHibermartPage) return null
        if (!isHibermartCart && isHibermartPage) return null
    }

    // Dynamic colors
    const themeColor = isHibermartCart ? "text-blue-600" : "text-green-600"
    const buttonColor = isHibermartCart ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"

    // Calculate total savings
    const totalSavings = cart.reduce((sum, item) => {
        const originalPrice = item.originalPrice || item.price
        return sum + (originalPrice - item.price) * item.quantity
    }, 0)

    // Get first item image for the thumbnail
    const firstItemImage = cart[0]?.image || cart[0]?.imageUrl

    // Determine if it should be in the "up" position (above nav) or "down" position (at bottom)
    const isNavVisible = scrollDirection === "up"

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key="cart-summary-bar"
                initial={{ y: 100, opacity: 0 }}
                animate={{
                    y: 0,
                    opacity: 1,
                    bottom: isNavVisible ? 70 : 8
                }}
                exit={{ y: 100, opacity: 0 }}
                transition={{
                    y: { duration: 0.3, ease: "easeOut" },
                    bottom: { duration: 0.3, ease: "easeInOut" }
                }}
                className="fixed left-0 right-0 z-[49] px-3 pb-2 md:hidden"
            >
                <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] border border-gray-100 dark:border-gray-800 p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Item Thumbnail */}
                        <div className="w-12 h-12 rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden bg-gray-50 flex-shrink-0">
                            <img src={firstItemImage} alt="cart item" className="w-full h-full object-contain" />
                        </div>

                        {/* Item Count and Savings */}
                        <div className="flex flex-col">
                            <div className="flex items-center gap-1">
                                <span className="font-bold text-gray-900 dark:text-white text-sm">
                                    {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
                                </span>
                                <ChevronUp size={16} className={themeColor} />
                            </div>
                            {totalSavings > 0 && (
                                <span className="text-green-600 text-xs font-bold">
                                    You save ₹{Math.round(totalSavings)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* View Cart Button */}
                    <Link
                        to="/food/user/cart"
                        className={`${buttonColor} text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-sm`}
                    >
                        View Cart
                    </Link>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}

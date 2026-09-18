import { Link, useLocation } from "react-router-dom"
import { ShoppingBag, BadgePercent, User, Bike } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useScrollDirection } from "../hooks/useScrollDirection"

export default function BottomNavigation() {
  const location = useLocation()
  const scrollDirection = useScrollDirection()

  // Check active routes - support both /user/* and /* paths
  // Same reason as UserLayout: these tests were written for the app at
  // the site root. Under /food/user the raw pathname never matches, so
  // no tab ever reads as active.
  const MOUNT_BASE = "/food/user"
  const relPath = location.pathname.startsWith(MOUNT_BASE)
    ? location.pathname.slice(MOUNT_BASE.length) || "/"
    : location.pathname

  const isInMart = relPath.startsWith("/in-mart") || relPath.startsWith("/food/user/in-mart")
  const isUnder250 = relPath.startsWith("/under-250") || relPath.startsWith("/food/user/under-250")
  const isProfile = relPath.startsWith("/profile") || relPath.startsWith("/food/user/profile")
  const isDelivery = !isInMart && !isUnder250 && !isProfile && (relPath === "/" || relPath === "/food/user" || (relPath.startsWith("/") && !relPath.startsWith("/restaurant") && !relPath.startsWith("/delivery") && !relPath.startsWith("/admin") && !relPath.startsWith("/usermain")))

  const isVisible = scrollDirection === "up"

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 z-50 shadow-lg"
        >
          <div className="flex items-center justify-around h-auto px-4 sm:px-6">
            {/* Delivery Tab */}
            <Link
              to="/food/user"
              className={`flex flex-col items-center gap-1.5 px-4 sm:px-5 py-2 transition-all duration-200 relative ${isDelivery
                ? "text-green-600"
                : "text-gray-400"
                }`}
            >
              <Bike className={`h-5 w-5 ${isDelivery ? "text-green-600" : "text-gray-400"}`} strokeWidth={2.5} />
              <span className={`text-xs sm:text-sm font-medium ${isDelivery ? "text-green-600 font-semibold" : "text-gray-400"}`}>
                Delivery
              </span>
              {isDelivery && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-600 rounded-b-full" />
              )}
            </Link>

            {/* Divider */}
            <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

            {/* Under 250 Tab */}
            <Link
              to="/food/user/under-250"
              className={`flex flex-col items-center gap-1.5 px-4 sm:px-5 py-2 transition-all duration-200 relative ${isUnder250
                ? "text-green-600"
                : "text-gray-400"
                }`}
            >
              <BadgePercent className={`h-5 w-5 ${isUnder250 ? "text-green-600" : "text-gray-400"}`} strokeWidth={2.5} />
              <span className={`text-xs sm:text-sm font-medium ${isUnder250 ? "text-green-600 font-semibold" : "text-gray-400"}`}>
                Under 250
              </span>
              {isUnder250 && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-600 rounded-b-full" />
              )}
            </Link>

            {/* Divider */}
            <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

            {/* In Mart Tab */}
            <Link
              to="/food/user/in-mart"
              className={`flex flex-col items-center gap-1.5 px-4 sm:px-5 py-2 transition-all duration-200 relative ${isInMart
                ? "text-green-600"
                : "text-gray-400"
                }`}
            >
              <ShoppingBag className={`h-5 w-5 ${isInMart ? "text-green-600" : "text-gray-400"}`} strokeWidth={2.5} />
              <span className={`text-xs sm:text-sm font-medium ${isInMart ? "text-green-600 font-semibold" : "text-gray-400"}`}>
                Hibermart
              </span>
              {isInMart && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-600 rounded-b-full" />
              )}
            </Link>

            {/* Divider */}
            <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

            {/* Profile Tab */}
            <Link
              to="/food/user/profile"
              className={`flex flex-col items-center gap-1.5 px-4 sm:px-5 py-2 transition-all duration-200 relative ${isProfile
                ? "text-green-600"
                : "text-gray-400"
                }`}
            >
              <User className={`h-5 w-5 ${isProfile ? "text-green-600" : "text-gray-400"}`} strokeWidth={2.5} />
              <span className={`text-xs sm:text-sm font-medium ${isProfile ? "text-green-600 font-semibold" : "text-gray-400"}`}>
                Profile
              </span>
              {isProfile && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-600 rounded-b-full" />
              )}
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

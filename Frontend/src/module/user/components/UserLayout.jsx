import { Outlet, useLocation } from "react-router-dom"
import { useEffect, useState, createContext, useContext } from "react"
import { ProfileProvider } from "../context/ProfileContext"
import LocationPrompt from "./LocationPrompt"
import { CartProvider } from "../context/CartContext"
import { OrdersProvider } from "../context/OrdersContext"
import SearchOverlay from "./SearchOverlay"
import LocationSelectorOverlay from "./LocationSelectorOverlay"
import BottomNavigation from "./BottomNavigation"
import DesktopNavbar from "./DesktopNavbar"
import CartSummaryBar from "./CartSummaryBar"

// Create SearchOverlay context with default value
const SearchOverlayContext = createContext({
  isSearchOpen: false,
  searchValue: "",
  setSearchValue: () => {
    console.warn("SearchOverlayProvider not available")
  },
  openSearch: () => {
    console.warn("SearchOverlayProvider not available")
  },
  closeSearch: () => { }
})

export function useSearchOverlay() {
  const context = useContext(SearchOverlayContext)
  // Always return context, even if provider is not available (will use default values)
  return context
}

function SearchOverlayProvider({ children }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const openSearch = () => {
    setIsSearchOpen(true)
  }

  const closeSearch = () => {
    setIsSearchOpen(false)
    setSearchValue("")
  }

  return (
    <SearchOverlayContext.Provider value={{ isSearchOpen, searchValue, setSearchValue, openSearch, closeSearch }}>
      {children}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={closeSearch}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
      />
    </SearchOverlayContext.Provider>
  )
}

// Create LocationSelector context with default value
const LocationSelectorContext = createContext({
  isLocationSelectorOpen: false,
  openLocationSelector: () => {
    console.warn("LocationSelectorProvider not available")
  },
  closeLocationSelector: () => { }
})

export function useLocationSelector() {
  const context = useContext(LocationSelectorContext)
  if (!context) {
    throw new Error("useLocationSelector must be used within LocationSelectorProvider")
  }
  return context
}

function LocationSelectorProvider({ children }) {
  const [isLocationSelectorOpen, setIsLocationSelectorOpen] = useState(false)

  const openLocationSelector = () => {
    setIsLocationSelectorOpen(true)
  }

  const closeLocationSelector = () => {
    setIsLocationSelectorOpen(false)
  }

  const value = {
    isLocationSelectorOpen,
    openLocationSelector,
    closeLocationSelector
  }

  return (
    <LocationSelectorContext.Provider value={value}>
      {children}
      <LocationSelectorOverlay
        isOpen={isLocationSelectorOpen}
        onClose={closeLocationSelector}
      />
    </LocationSelectorContext.Provider>
  )
}

/**
 * Every context the customer screens rely on. Shared by this classic layout
 * and the app-style shell (design/shell/NextLayout), so switching shells never
 * changes what a screen can reach.
 */
export function UserProviders({ children }) {
  return (
    <CartProvider>
      <ProfileProvider>
        <OrdersProvider>
          <SearchOverlayProvider>
            <LocationSelectorProvider>{children}</LocationSelectorProvider>
          </SearchOverlayProvider>
        </OrdersProvider>
      </ProfileProvider>
    </CartProvider>
  )
}

export default function UserLayout() {
  const location = useLocation()

  useEffect(() => {
    // Reset scroll to top whenever location changes (pathname, search, or hash)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.pathname, location.search, location.hash])

  // Note: Authentication checks and redirects are handled by ProtectedRoute components
  // UserLayout should not interfere with authentication redirects

  // Show bottom navigation only on home page, in-mart page, under-250 page, and profile page
  // This app was written to live at the site root, so the checks below
  // compare against '/', '/in-mart' and friends. It is mounted under
  // /food/user now, so the raw pathname never matches and the bottom
  // navigation -- which carries the HiberMart switch -- disappeared on
  // every screen. Comparing the path RELATIVE to the mount keeps the
  // original conditions intact instead of rewriting each one.
  const MOUNT_BASE = "/food/user"
  const relPath = location.pathname.startsWith(MOUNT_BASE)
    ? location.pathname.slice(MOUNT_BASE.length) || "/"
    : location.pathname

  const showBottomNav = relPath === "/" ||
    relPath === "/food/user" ||
    relPath.startsWith("/in-mart") ||
    relPath.startsWith("/food/user/in-mart") ||
    relPath === "/under-250" ||
    relPath === "/food/user/under-250" ||
    relPath === "/profile" ||
    relPath === "/food/user/profile" ||
    relPath.startsWith("/food/user/profile") ||
    relPath === "/search" ||
    relPath === "/food/user/search"
  const showCartSummary = showBottomNav && !relPath.includes("/profile")

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] transition-colors duration-200">
      <UserProviders>
                {/* <Navbar /> */}
                {showBottomNav && <DesktopNavbar />}
                <LocationPrompt />
                <Outlet />
                {showBottomNav && (
                  <>
                    {showCartSummary && <CartSummaryBar />}
                    <BottomNavigation />
                  </>
                )}
      </UserProviders>
    </div>
  )
}


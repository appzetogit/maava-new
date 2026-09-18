/**
 * MOUNTED UNDER /food/user, so every child path here is relative.
 *
 * The old app rendered this router at the site root, so its routes were
 * written absolute ('/in-mart'). React Router v6 throws on an absolute child
 * path inside a nested <Routes>, so the leading slash is stripped -- the only
 * change made to this file, and the only one needed to mount it in place.
 */
import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import NextLayout from "../design/shell/NextLayout"
import { readShellChoice } from "../design/shell/shellFlag"
import { APP_ROUTE_ALIASES, AliasRedirect } from "../design/shell/routeAliases"
import { lazy as lazyRoute, Suspense as RouteSuspense } from "react"
// Phase 1 review page for the Maava design system. Unlinked, and lazy so it adds nothing to the main bundle.
const DesignKit = lazyRoute(() => import("../design/DesignKit"))
const MartCategories = lazyRoute(() => import("../design/screens/MartCategories"))
// Phase 3: rebuilt screens render only inside the opt-in shell; the classic layout keeps the current ones.
const FoodHome = lazyRoute(() => import("../design/screens/FoodHome"))
const FoodRestaurant = lazyRoute(() => import("../design/screens/FoodRestaurant"))
const FoodSearch = lazyRoute(() => import("../design/screens/FoodSearch"))
const FoodCart = lazyRoute(() => import("../design/screens/FoodCart"))
const FoodTracking = lazyRoute(() => import("../design/screens/FoodTracking"))
const FoodOrders = lazyRoute(() => import("../design/screens/FoodOrders"))
const FoodProfile = lazyRoute(() => import("../design/screens/FoodProfile"))
const FoodEditProfile = lazyRoute(() => import("../design/screens/FoodEditProfile"))
const FoodAddresses = lazyRoute(() => import("../design/screens/FoodAddresses"))
const FoodAddressForm = lazyRoute(() => import("../design/screens/FoodAddressForm"))
import ProtectedRoute from "@/components/ProtectedRoute"
import AuthRedirect from "@/components/AuthRedirect"
import UserLayout from "./UserLayout"



// Home & Discovery
import Home from "../pages/Home"
import InMart from "../pages/InMart"
import InMartRestaurants from "../pages/InMartRestaurants"
import InMartCategory from "../pages/InMartCategory"
import InMartProductCategory from "../pages/InMartProductCategory"
import ProductSectionPage from "../pages/ProductSectionPage"
import InMartExplore50 from "../pages/InMartExplore50"
import InMartExploreNear from "../pages/InMartExploreNear"
import Coffee from "../pages/Coffee"
import Under250 from "../pages/Under250"
import CategoryPage from "../pages/CategoryPage"
import Restaurants from "../pages/restaurants/Restaurants"
import RestaurantDetails from "../pages/restaurants/RestaurantDetails"
import SearchResults from "../pages/SearchResults"
import ProductDetail from "../pages/ProductDetail"

// Cart
import Cart from "../pages/cart/Cart"

// Orders
import Orders from "../pages/orders/Orders"
import OrderTracking from "../pages/orders/OrderTracking"
import OrderInvoice from "../pages/orders/OrderInvoice"
import UserOrderDetails from "../pages/orders/UserOrderDetails"

// Offers
import Offers from "../pages/Offers"

// Gourmet
import Gourmet from "../pages/Gourmet"

// Top 10
import Top10 from "../pages/Top10"

// Collections
import Collections from "../pages/Collections"
import CollectionDetail from "../pages/CollectionDetail"

// Gift Cards
import GiftCards from "../pages/GiftCards"
import GiftCardCheckout from "../pages/GiftCardCheckout"

// Profile
import Profile from "../pages/profile/Profile"
import EditProfile from "../pages/profile/EditProfile"
import Payments from "../pages/profile/Payments"
import AddPayment from "../pages/profile/AddPayment"
import EditPayment from "../pages/profile/EditPayment"
import Favorites from "../pages/profile/Favorites"
import Settings from "../pages/profile/Settings"
import Coupons from "../pages/profile/Coupons"
import RedeemGoldCoupon from "../pages/profile/RedeemGoldCoupon"
import About from "../pages/profile/About"
import Terms from "../pages/profile/Terms"
import Privacy from "../pages/profile/Privacy"
import Refund from "../pages/profile/Refund"
import Shipping from "../pages/profile/Shipping"
import Cancellation from "../pages/profile/Cancellation"
import SendFeedback from "../pages/profile/SendFeedback"
import ReportSafetyEmergency from "../pages/profile/ReportSafetyEmergency"
import Accessibility from "../pages/profile/Accessibility"
import Logout from "../pages/profile/Logout"

// Auth
import SignIn from "../pages/auth/SignIn"
import OTP from "../pages/auth/OTP"
import AuthCallback from "../pages/auth/AuthCallback"

// Help
import Help from "../pages/help/Help"
import OrderHelp from "../pages/help/OrderHelp"

// Notifications
import Notifications from "../pages/Notifications"

// Wallet
import Wallet from "../pages/Wallet"

// Complaints
import SubmitComplaint from "../pages/complaints/SubmitComplaint"

export default function UserRouter() {
  // ?shell=next opts this browser into the app-style shell (Phase 2 beta);
  // everyone else keeps the classic layout on the same URLs.
  const location = useLocation()
  const nextShell = readShellChoice(location.search) === "next"
  return (
    <Routes>
      <Route element={nextShell ? <NextLayout /> : <UserLayout />}>
        {/* Home & Discovery */}
        <Route
          path=""
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              {nextShell ? <RouteSuspense fallback={null}><FoodHome /></RouteSuspense> : <Home />}
            </ProtectedRoute>
          }
        />
        <Route path="in-mart" element={<InMart />} />
        <Route path="in-mart/categories" element={<RouteSuspense fallback={null}><MartCategories /></RouteSuspense>} />

        <Route path="in-mart/restaurants" element={<InMartRestaurants />} />
        <Route path="in-mart/products/:categorySlug" element={<InMartProductCategory />} />
        <Route path="in-mart/section/:sectionId" element={<ProductSectionPage />} />
        <Route path="in-mart/:category" element={<InMartCategory />} />
        <Route path="in-mart/explore/upto50" element={<InMartExplore50 />} />
        <Route path="in-mart/explore/near-rated" element={<InMartExploreNear />} />
        <Route path="in-mart/coffee" element={<Coffee />} />
        <Route path="under-250" element={<Under250 />} />
        <Route path="category/:category" element={<CategoryPage />} />
        <Route path="restaurants" element={<Restaurants />} />
        <Route path="restaurants/:slug" element={nextShell ? <RouteSuspense fallback={null}><FoodRestaurant /></RouteSuspense> : <RestaurantDetails />} />
        <Route path="design-kit" element={<RouteSuspense fallback={null}><DesignKit /></RouteSuspense>} />
        {/* Local development only (stripped from production builds): the cart without sign-in, to check its layout. */}
        {import.meta.env.DEV && <Route path="dev/cart" element={<RouteSuspense fallback={null}><FoodCart /></RouteSuspense>} />}
        {import.meta.env.DEV && <Route path="dev/order/:orderId" element={<RouteSuspense fallback={null}><FoodTracking /></RouteSuspense>} />}
        {import.meta.env.DEV && <Route path="dev/orders" element={<RouteSuspense fallback={null}><FoodOrders demo /></RouteSuspense>} />}
        {import.meta.env.DEV && <Route path="dev/home" element={<RouteSuspense fallback={null}><FoodHome /></RouteSuspense>} />}
        {import.meta.env.DEV && <Route path="dev/profile" element={<RouteSuspense fallback={null}><FoodProfile /></RouteSuspense>} />}
        {import.meta.env.DEV && <Route path="dev/profile/edit" element={<RouteSuspense fallback={null}><FoodEditProfile /></RouteSuspense>} />}
        {import.meta.env.DEV && <Route path="dev/addresses" element={<RouteSuspense fallback={null}><FoodAddresses /></RouteSuspense>} />}
        {import.meta.env.DEV && <Route path="dev/addresses/new" element={<RouteSuspense fallback={null}><FoodAddressForm /></RouteSuspense>} />}
        <Route path="search" element={nextShell ? <RouteSuspense fallback={null}><FoodSearch /></RouteSuspense> : <SearchResults />} />
        <Route path="product/:id" element={<ProductDetail />} />

        {/* Cart - Protected */}
        <Route
          path="cart"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              {nextShell ? <RouteSuspense fallback={null}><FoodCart /></RouteSuspense> : <Cart />}
            </ProtectedRoute>
          }
        />
        {/* The old checkout page was a template that faked orders (setTimeout, local-only, prices x83). */}
        {/* The real checkout is the cart page, so old links land there. */}
        <Route path="cart/checkout" element={<Navigate to="/food/user/cart" replace />} />

        {/* Orders - Protected */}
        <Route
          path="orders"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              {nextShell ? <RouteSuspense fallback={null}><FoodOrders /></RouteSuspense> : <Orders />}
            </ProtectedRoute>
          }
        />
        <Route
          path="orders/:orderId"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              {nextShell ? <RouteSuspense fallback={null}><FoodTracking /></RouteSuspense> : <OrderTracking />}
            </ProtectedRoute>
          }
        />
        <Route
          path="orders/:orderId/invoice"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <OrderInvoice />
            </ProtectedRoute>
          }
        />
        <Route
          path="orders/:orderId/details"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <UserOrderDetails />
            </ProtectedRoute>
          }
        />

        {/* Offers */}
        <Route path="offers" element={<Offers />} />

        {/* Gourmet */}
        <Route path="gourmet" element={<Gourmet />} />

        {/* Top 10 */}
        <Route path="top-10" element={<Top10 />} />

        {/* Collections */}
        <Route path="collections" element={<Collections />} />
        <Route
          path="collections/:id"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <CollectionDetail />
            </ProtectedRoute>
          }
        />

        {/* Gift Cards */}
        <Route path="gift-card" element={<GiftCards />} />
        <Route
          path="gift-card/checkout"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <GiftCardCheckout />
            </ProtectedRoute>
          }
        />

        {/* Profile - Protected */}
        <Route
          path="profile"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              {nextShell ? <RouteSuspense fallback={null}><FoodProfile /></RouteSuspense> : <Profile />}
            </ProtectedRoute>
          }
        />
        {/* Delivery addresses: rebuilt screens in the new shell; the classic site had none. */}
        <Route path="addresses" element={nextShell ? <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in"><RouteSuspense fallback={null}><FoodAddresses /></RouteSuspense></ProtectedRoute> : <Navigate to="/food/user/profile" replace />} />
        <Route path="addresses/new" element={nextShell ? <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in"><RouteSuspense fallback={null}><FoodAddressForm /></RouteSuspense></ProtectedRoute> : <Navigate to="/food/user/profile" replace />} />
        <Route path="addresses/:addressId/edit" element={nextShell ? <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in"><RouteSuspense fallback={null}><FoodAddressForm /></RouteSuspense></ProtectedRoute> : <Navigate to="/food/user/profile" replace />} />
        <Route
          path="profile/edit"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              {nextShell ? <RouteSuspense fallback={null}><FoodEditProfile /></RouteSuspense> : <EditProfile />}
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/payments"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Payments />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/payments/new"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <AddPayment />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/payments/:id/edit"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <EditPayment />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/favorites"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Favorites />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/settings"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/coupons"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Coupons />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/redeem-gold-coupon"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <RedeemGoldCoupon />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/about"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <About />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/terms"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Terms />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/privacy"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Privacy />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/refund"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Refund />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/shipping"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Shipping />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/cancellation"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Cancellation />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/send-feedback"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <SendFeedback />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/report-safety-emergency"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <ReportSafetyEmergency />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/accessibility"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Accessibility />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/logout"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Logout />
            </ProtectedRoute>
          }
        />

        {/* Auth */}
        <Route path="auth/sign-in" element={<AuthRedirect module="user"><SignIn /></AuthRedirect>} />
        <Route path="auth/otp" element={<AuthRedirect module="user"><OTP /></AuthRedirect>} />
        <Route path="auth/callback" element={<AuthRedirect module="user"><AuthCallback /></AuthRedirect>} />

        {/* Help */}
        <Route path="help" element={<Help />} />
        <Route path="help/orders/:orderId" element={<OrderHelp />} />

        {/* Notifications - Protected */}
        <Route
          path="notifications"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Notifications />
            </ProtectedRoute>
          }
        />

        {/* Wallet - Protected */}
        <Route
          path="wallet"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <Wallet />
            </ProtectedRoute>
          }
        />

        {/* Complaints - Protected */}
        <Route
          path="complaints/submit/:orderId"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/food/user/auth/sign-in">
              <SubmitComplaint />
            </ProtectedRoute>
          }
        />

        {/* The app's own paths (share links, notification deep links) -> the website's screens. */}
        {APP_ROUTE_ALIASES.map(([from, to]) => (
          <Route key={from} path={from} element={<AliasRedirect to={to} />} />
        ))}
      </Route>
    </Routes>
  )
}


import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, lazy, useEffect, useState } from 'react'
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons'
import LandingPage from './LandingPage'
import { isFeatureEnabled, loadCorePublicAppConfig } from '@food/services/publicAppConfig'

const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazy(() => import('../modules/Food/routes'))
const AuthApp = lazy(() => import('../modules/auth/routes'))
import ProtectedRoute from '@food/components/ProtectedRoute'

const PageLoader = () => <AppShellSkeleton />

/**
 * FoodAppWrapper — Quick-spicy App. को /food prefix के साथ render करता है.
 * 
 * Quick-spicy की App.jsx में routes /restaurant, /usermain, /admin, /delivery
 * जैसे hain (bina /food prefix ke). Yahan hum useLocation se /food ke baad wala
 * path nikalne ke baad FoodApp render karte hain. FoodApp internally BrowserRouter
 * nahi use karta (sirf Routes use karta hai), isliye ye directly kaam karta hai.
 */
const FoodAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <FoodApp />
    </Suspense>
  )
}

/**
 * Anything that used to belong to the customer or rider web apps.
 *
 * Both are Flutter apps; the web copies were deleted rather than kept in step
 * with them. These paths stay mapped instead of falling through to the 404
 * catch-all so an old bookmark lands somewhere real.
 */
const RedirectToAdmin = () => <Navigate to="/admin" replace />;

const RootEntryRoute = () => {
  const [loading, setLoading] = useState(true)
  const [showLandingAtRoot, setShowLandingAtRoot] = useState(true)

  useEffect(() => {
    const loadFeatureSettings = async () => {
      try {
        await loadCorePublicAppConfig()
        setShowLandingAtRoot(
          isFeatureEnabled("root_landing_and_unregistered_control", true),
        )
      } catch (_error) {
        // fallback to landing page when API is unavailable
      } finally {
        setLoading(false)
      }
    }
    loadFeatureSettings()
  }, [])

  if (loading) return <PageLoader />
  if (!showLandingAtRoot) return <Navigate to="/admin" replace />
  return <LandingPage />
}


const PublicCmsPage = lazy(() => import('./PublicCmsPage'))
const AdminRouter = lazy(() => import('../modules/Food/components/admin/AdminRouter'))
const SellerRouter = lazy(() => import('../modules/Food/components/restaurant/RestaurantRouter'))

/**
 * Sends the old /food/restaurant/* addresses to /seller/*.
 *
 * A redirect rather than a second mount: two live copies of the panel would
 * mean two sessions, two sets of sockets, and a bug fixed in one of them. The
 * rest of the path, the query string and the hash survive, so a deep link to a
 * specific order still lands on it.
 */
const RedirectToSeller = () => {
  const location = useLocation()
  const target =
    location.pathname.replace(/^\/food\/restaurant/, '/seller') +
    location.search +
    location.hash
  return <Navigate to={target} replace />
}

const AppRoutes = () => {
  const location = useLocation()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const protocol = String(window.location?.protocol || '').toLowerCase()
    const userAgent = String(window.navigator?.userAgent || '').toLowerCase()
    const isNativeLikeShell =
      Boolean(window.flutter_inappwebview) ||
      Boolean(window.ReactNativeWebView) ||
      protocol === 'file:' ||
      userAgent.includes(' wv') ||
      userAgent.includes('; wv')

    if (!isNativeLikeShell) return

    const route = `${location.pathname || ''}${location.search || ''}`
    if (route.startsWith('/food/') || route.startsWith('/admin')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
      {/* Root → Master Landing Page */}
      <Route path="/" element={<RootEntryRoute />} />

      {/* Auth Module */}


      {/*
        Public CMS pages -- privacy, terms, about, support. The landing page
        footer links here. They previously lived at /food/user/profile/*, which
        went with the customer web app; a consumer product still has to keep its
        privacy policy and terms reachable.
      */}
      <Route
        path="/pages/:slug"
        element={
          <Suspense fallback={<PageLoader />}>
            <PublicCmsPage />
          </Suspense>
        }
      />

      {/* Food Module */}
      <Route path="/food/*" element={<FoodAppWrapper />} />

      {/* Seller Portal. Canonical home of the partner panel. */}
      <Route
        path="/seller/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <SellerRouter />
          </Suspense>
        }
      />
      {/* Where the panel used to live; bookmarks and old links still resolve. */}
      <Route path="/food/restaurant/*" element={<RedirectToSeller />} />

      {/*
        Global Admin Portal. AdminRouter handles its own protection for sub-routes.
        Wrapped in Suspense because it is lazy: without it a direct /admin URL
        renders blank. This route was previously declared twice, once bare and
        once wrapped, and React Router kept the first -- the unwrapped one.
      */}
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <AdminRouter />
          </Suspense>
        }
      />

      {/* Dynamic intercept redirects for bare paths (accessed programmatically) */}
      <Route path="/user/*" element={<RedirectToAdmin />} />
      <Route path="/restaurant/*" element={<RedirectToSeller />} />
      <Route path="/delivery/*" element={<RedirectToAdmin />} />
      <Route path="/usermain/*" element={<RedirectToAdmin />} />
      <Route path="/profile/*" element={<RedirectToAdmin />} />
      <Route path="/cart/*" element={<RedirectToAdmin />} />
      <Route path="/orders/*" element={<RedirectToAdmin />} />

      {/* Fallback 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes

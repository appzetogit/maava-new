import { Navigate } from "react-router-dom"
import { isModuleAuthenticated } from "@food/utils/auth"

/**
 * AuthRedirect Component
 * Redirects authenticated users away from auth pages to their module's home page
 */
export default function AuthRedirect({ children, module, redirectTo = null }) {
  const isAuthenticated = isModuleAuthenticated(module)

  // `admin` said "/food/admin", which has never been a route in this app -- the
  // admin panel is mounted at /admin. An already-signed-in admin landing on the
  // login page was redirected into the Food module and only reached the panel
  // via its catch-all, which is a bug that happened to look like it worked.
  const moduleHomePages = {
    restaurant: "/seller",
    admin: "/admin",
  }

  if (isAuthenticated) {
    const homePath = redirectTo || moduleHomePages[module] || "/admin"
    return <Navigate to={homePath} replace />
  }

  return <>{children}</>
}

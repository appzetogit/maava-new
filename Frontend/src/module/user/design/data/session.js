import { authAPI } from "@food/api"
import { clearModuleAuth } from "@/lib/utils/auth"

/**
 * Sign the customer out completely. The current site's logout leaves the
 * refresh token and the cached profile, addresses and favourites behind (the
 * next person on the device could see them), and its /profile/logout page
 * never clears the access token at all.
 *
 * Theme, veg mode and the cart stay, as in the app.
 */
const LEFTOVERS = [
  "user_refreshToken",
  "accessToken",
  "user",
  "user_user",
  "userProfile",
  "userAddresses",
  "userFavorites",
  "userDishFavorites",
  "userPaymentMethods",
  "appzeto_user_profile",
  "mv.deliveryAddressId",
  "mv.recentSearches",
]

export async function signOut({ tellServer = true } = {}) {
  if (tellServer) {
    try {
      await authAPI.logout()
    } catch {
      /* the local sign-out below still happens */
    }
  }
  clearModuleAuth("user")
  for (const key of LEFTOVERS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* storage blocked */
    }
  }
  window.dispatchEvent(new Event("userAuthChanged"))
}

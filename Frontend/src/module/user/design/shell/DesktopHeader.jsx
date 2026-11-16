import { NavLink, useNavigate } from "react-router-dom"
import { ReceiptText, Search, ShoppingBag, ShoppingBasket, User, Utensils } from "lucide-react"
import { useProfile } from "../../context/ProfileContext"
import { MOUNT } from "./AppModeProvider"
import "./desktop.css"

const isSignedIn = () => {
  try {
    return localStorage.getItem("user_authenticated") === "true" || Boolean(localStorage.getItem("user_accessToken"))
  } catch {
    return false
  }
}

/**
 * The bar wide screens get instead of the phone's bottom tabs. Hidden below
 * 1024px by desktop.css, so phones keep exactly the app layout they had.
 *
 * Not sticky: several screens pin their own search or header at top: 0, and a
 * second sticky bar above them would cover it.
 */
export default function DesktopHeader({ mode, itemCount, showSwitch, onSwitch }) {
  const navigate = useNavigate()
  const { userProfile } = useProfile()
  const signedIn = isSignedIn()
  const firstName = String(userProfile?.name || userProfile?.fullName || "").trim().split(/\s+/)[0]
  const navClass = ({ isActive }) => (isActive ? "mv-dh__link mv-dh__link--on" : "mv-dh__link")

  return (
    <header className="mv-dh">
      <div className="mv-dh__inner">
        <NavLink to={MOUNT} end className="mv-dh__logo" aria-label="Maava home">
          maava
        </NavLink>

        {showSwitch && (
          <div className="mv-dh__modes" role="group" aria-label="Shop">
            <button type="button" className="mv-dh__mode" aria-pressed={mode === "food"} onClick={() => mode !== "food" && onSwitch()}>
              <Utensils aria-hidden="true" />
              Food
            </button>
            <button type="button" className="mv-dh__mode" aria-pressed={mode === "mart"} onClick={() => mode !== "mart" && onSwitch()}>
              <ShoppingBasket aria-hidden="true" />
              Mart
            </button>
          </div>
        )}

        <button type="button" className="mv-dh__search" onClick={() => navigate(`${MOUNT}/search`)}>
          <Search aria-hidden="true" />
          <span>Search restaurants and dishes</span>
        </button>

        <nav className="mv-dh__nav" aria-label="Main">
          <NavLink to={`${MOUNT}/under-250`} className={navClass}>
            99 Store
          </NavLink>
          <NavLink to={`${MOUNT}/offers`} className={navClass}>
            Offers
          </NavLink>
          <NavLink to={`${MOUNT}/orders`} className={navClass}>
            <ReceiptText aria-hidden="true" />
            Orders
          </NavLink>
          <NavLink to={`${MOUNT}/cart`} className={navClass}>
            <ShoppingBag aria-hidden="true" />
            Cart
            {itemCount > 0 && <span className="mv-dh__badge">{itemCount > 99 ? "99+" : itemCount}</span>}
          </NavLink>
          {signedIn ? (
            <NavLink to={`${MOUNT}/profile`} className={navClass}>
              <User aria-hidden="true" />
              {firstName || "Profile"}
            </NavLink>
          ) : (
            <NavLink to={`${MOUNT}/auth/sign-in`} className="mv-dh__signin">
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}

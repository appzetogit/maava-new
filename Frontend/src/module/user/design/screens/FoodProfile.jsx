import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Ban,
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileText,
  Headset,
  Heart,
  Info,
  Leaf,
  LogOut,
  MapPin,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Share2,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sun,
  Tag,
  Trash2,
  User,
  Wallet,
  XCircle,
} from "lucide-react"
import { orderAPI, publicConfigGetOnce, userAPI } from "@food/api"
import { useProfile } from "../../context/ProfileContext"
import { BottomSheet, Button, PalettePicker, toast, useBrand } from "../index"
import { ACTIVE, isCancelled } from "../data/useOrderTracking"
import { useWalletBalance } from "../data/useCheckout"
import { signOut } from "../data/session"
import "./profile.css"

/**
 * Profile, rebuilt from presentation/profile/profile_screen.dart.
 *
 * User card; Wallet | Coupons and My Cart | Saved Addresses tiles; preferences
 * (notifications, veg mode, appearance, app theme, favourites); order counts;
 * share; help and legal; Log Out and Delete Account.
 *
 * Unlike the current site it links to real address management, logs out
 * completely (the old logout left the refresh token and the cached profile,
 * addresses and favourites behind), and offers account deletion when the
 * operator allows it.
 */
const THEME_MODES = [
  ["light", "Light Mode", Sun],
  ["dark", "Dark Mode", Moon],
  ["system", "System Default", Monitor],
]
const photoOf = (p) => {
  const v = p?.profileImage ?? p?.avatar
  return typeof v === "string" ? v : v?.url || ""
}

function useOrderCounts() {
  const [counts, setCounts] = useState(null)
  useEffect(() => {
    let alive = true
    orderAPI
      .getOrders({ page: 1, limit: 50 })
      .then((res) => {
        const body = res?.data?.data ?? res?.data ?? {}
        const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []
        const s = (o) => String(o?.orderStatus || o?.status || "")
        if (alive)
          setCounts({
            upcoming: list.filter((o) => ACTIVE.has(s(o))).length,
            completed: list.filter((o) => ["delivered", "completed"].includes(s(o))).length,
            cancelled: list.filter((o) => isCancelled(s(o))).length,
          })
      })
      .catch(() => alive && setCounts(null))
    return () => {
      alive = false
    }
  }, [])
  return counts
}

function useAccountDeletionEnabled() {
  const [enabled, setEnabled] = useState(true) // shown until the flag says otherwise, as in the app
  useEffect(() => {
    let alive = true
    publicConfigGetOnce("/food/admin/feature-settings/public")
      .then((res) => {
        const rows = res?.data?.data
        const row = Array.isArray(rows) ? rows.find((r) => r?.key === "account_deletion") : null
        if (alive && row) setEnabled(row.isEnabled !== false)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return enabled
}

function Row({ icon: Icon, title, subtitle, onClick, trailing, tone }) {
  return (
    <button type="button" className="fp-row" onClick={onClick}>
      <span className={tone ? `fp-row__icon fp-row__icon--${tone}` : "fp-row__icon"} aria-hidden="true">
        <Icon />
      </span>
      <span className="fp-row__text">
        <b>{title}</b>
        {subtitle && <small>{subtitle}</small>}
      </span>
      {trailing ?? <ChevronRight className="fp-row__chev" aria-hidden="true" />}
    </button>
  )
}

function Tile({ icon: Icon, label, value, onClick }) {
  return (
    <button type="button" className="fp-tile" onClick={onClick}>
      <span className="fp-tile__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="fp-tile__text">
        <small>{label}</small>
        <b>{value}</b>
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  )
}

export default function FoodProfile() {
  const navigate = useNavigate()
  const { userProfile, addresses = [], vegMode, setVegMode } = useProfile()
  const brand = useBrand()
  const wallet = useWalletBalance()
  const counts = useOrderCounts()
  const canDelete = useAccountDeletionEnabled()
  const [sheet, setSheet] = useState(null) // appearance | theme | logout | delete
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)

  const go = (path) => () => navigate(`/food/user/${path}`)
  const name = userProfile?.name || userProfile?.fullName || "User"
  const photo = photoOf(userProfile)
  const themeLabel = { light: "Light", dark: "Dark", system: "System" }[brand?.themeMode] || "Light"
  const palette = brand?.palettes?.find((p) => p.id === brand?.paletteId)

  const share = async () => {
    const url = `${window.location.origin}/food/user`
    const text = `Check out MAAVA for delicious food delivery: ${url}`
    try {
      if (navigator.share) await navigator.share({ title: "MAAVA", text, url })
      else {
        await navigator.clipboard.writeText(text)
        toast.success("Invite link copied")
      }
    } catch {
      /* closed the share sheet */
    }
  }

  const logout = async () => {
    setBusy(true)
    await signOut()
    toast.success("Logged out successfully")
    // A full reload resets every screen's in-memory copy of the old account.
    window.location.assign("/food/user")
  }

  const deleteAccount = async () => {
    setBusy(true)
    try {
      await userAPI.deleteCurrentUserAccount()
      await signOut({ tellServer: false })
      toast.success("Account deleted")
      window.location.assign("/food/user")
    } catch (err) {
      setBusy(false)
      toast.error(err?.response?.data?.message || "Could not delete account. Please try again.")
    }
  }

  return (
    <div className="fp">
      <header className="fp-title">
        <h1>Profile</h1>
        <p>Manage your account, orders &amp; preferences</p>
      </header>

      {/* ---------------- user card ---------------- */}
      <section className="fp-user" aria-label="Your account">
        <div className="fp-user__row">
          <button type="button" className="fp-avatar" onClick={go("profile/edit")} aria-label="Change profile photo">
            {photo ? <img src={photo} alt="" /> : <User aria-hidden="true" />}
            <span className="fp-avatar__badge" aria-hidden="true">
              <Camera />
            </span>
          </button>
          <div className="fp-user__text">
            <b>{name}</b>
            {userProfile?.phone && <small>{userProfile.phone}</small>}
            {userProfile?.email && <small>{userProfile.email}</small>}
          </div>
        </div>
        <button type="button" className="fp-user__edit" onClick={go("profile/edit")}>
          <Pencil aria-hidden="true" />
          Edit Profile
        </button>
      </section>

      {/* ---------------- tiles ---------------- */}
      <section className="fp-card fp-tiles">
        <Tile icon={Wallet} label="Wallet" value={wallet == null ? "View Balance" : `₹${wallet.toFixed(2)}`} onClick={go("wallet")} />
        <i aria-hidden="true" />
        <Tile icon={Tag} label="Coupons" value="View offers" onClick={go("profile/coupons")} />
      </section>
      <section className="fp-card fp-tiles">
        <Tile icon={ShoppingCart} label="My Cart" value="View Cart" onClick={go("cart")} />
        <i aria-hidden="true" />
        <Tile icon={MapPin} label="Saved Addresses" value={`${addresses.length} Saved`} onClick={go("addresses")} />
      </section>

      {/* ---------------- preferences ---------------- */}
      <section className="fp-card fp-list" aria-label="Preferences">
        <Row icon={Bell} title="Notifications & Alerts" subtitle="Your order updates and offers" onClick={go("notifications")} />
        <Row
          icon={Leaf}
          tone="green"
          title="Veg Mode"
          subtitle="Show only vegetarian food items"
          onClick={() => setVegMode(!vegMode)}
          trailing={
            <span className={vegMode ? "fp-switch is-on" : "fp-switch"} role="switch" aria-checked={Boolean(vegMode)} aria-label="Veg mode">
              <i />
            </span>
          }
        />
        <Row icon={Palette} title="Appearance Settings" subtitle={`Theme: ${themeLabel} mode`} onClick={() => setSheet("appearance")} />
        <Row icon={Palette} title="App Theme" subtitle={palette?.label || palette?.name || "Pick your brand colour"} onClick={() => setSheet("theme")} />
        <Row icon={Heart} title="Favorites" subtitle="Your favorite restaurants & dishes" onClick={go("profile/favorites")} />
      </section>

      {/* ---------------- orders ---------------- */}
      <section className="fp-card fp-orders" aria-labelledby="fp-orders-h">
        <div className="fp-orders__head">
          <h2 id="fp-orders-h">My Orders</h2>
          <button type="button" onClick={go("orders")}>
            View All Orders
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <div className="fp-orders__stats">
          {[
            [ShoppingBag, "Upcoming", counts?.upcoming, "brand"],
            [CheckCircle2, "Completed", counts?.completed, "green"],
            [XCircle, "Cancelled", counts?.cancelled, "red"],
          ].map(([Icon, label, n, tone]) => (
            <button key={label} type="button" className="fp-stat" onClick={go("orders")}>
              <span className={`fp-stat__icon fp-stat__icon--${tone}`} aria-hidden="true">
                <Icon />
              </span>
              <b>{n ?? "–"}</b>
              <small>{label}</small>
            </button>
          ))}
        </div>
      </section>

      {/* ---------------- share / help / legal ---------------- */}
      <section className="fp-card fp-list" aria-label="More">
        <Row icon={Share2} title="Share App" subtitle="Share MAAVA food delivery with friends" onClick={share} />
        <Row icon={Headset} title="Help & Support" subtitle="FAQs, order issues & support" onClick={go("help")} />
        <Row icon={Shield} title="Privacy Policy" subtitle="How MAAVA handles your data" onClick={go("profile/privacy")} />
        <Row icon={FileText} title="Terms & Conditions" subtitle="The terms you agree to when ordering" onClick={go("profile/terms")} />
        <Row icon={Info} title="About MAAVA" subtitle="Who we are" onClick={go("profile/about")} />
      </section>

      <button type="button" className="fp-logout" onClick={() => setSheet("logout")}>
        <LogOut aria-hidden="true" />
        Log Out
      </button>
      {canDelete && (
        <button
          type="button"
          className="fp-delete"
          onClick={() => {
            setConfirmText("")
            setSheet("delete")
          }}
        >
          <Trash2 aria-hidden="true" />
          Delete Account
        </button>
      )}

      {/* ---------------- sheets ---------------- */}
      <BottomSheet open={sheet === "appearance"} onClose={() => setSheet(null)} title="Select Theme Appearance">
        <div className="fp-options" role="radiogroup" aria-label="Appearance">
          {THEME_MODES.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={brand?.themeMode === id}
              onClick={() => {
                brand?.setThemeMode?.(id)
                setSheet(null)
              }}
            >
              <Icon aria-hidden="true" />
              {label}
              {brand?.themeMode === id && <CheckCircle2 className="fp-options__check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "theme"} onClose={() => setSheet(null)} title="App Theme">
        <p className="fp-muted">Pick your favorite brand color</p>
        <PalettePicker label="App theme" />
      </BottomSheet>

      <BottomSheet open={sheet === "logout"} onClose={() => setSheet(null)} title="Log Out">
        <p className="mv-body-medium">Are you sure you want to log out of your account?</p>
        <div className="fp-sheet-actions">
          <Button variant="outline" onClick={() => setSheet(null)}>
            Cancel
          </Button>
          <button type="button" className="fp-danger" onClick={logout} disabled={busy}>
            Log Out
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "delete"} onClose={() => setSheet(null)} title="Delete Account">
        <p className="mv-body-medium">This permanently deletes your account, orders, addresses, wallet balance and saved data. This cannot be undone.</p>
        <label className="fp-confirm">
          <span>Type DELETE to confirm</span>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
        </label>
        <div className="fp-sheet-actions">
          <Button variant="outline" onClick={() => setSheet(null)}>
            Cancel
          </Button>
          <button type="button" className="fp-danger" onClick={deleteAccount} disabled={busy || confirmText.trim() !== "DELETE"}>
            <Ban aria-hidden="true" />
            Delete
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

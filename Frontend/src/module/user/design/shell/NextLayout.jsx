import { useEffect, useRef, useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import LocationPrompt from "../../components/LocationPrompt"
import { UserProviders } from "../../components/UserLayout"
import { useCart } from "../../context/CartContext"
import { BrandProvider } from "../BrandProvider"
import { BottomNav, ModeSwitchButton } from "../components/chrome"
import { AppModeProvider, MOUNT, useAppMode } from "./AppModeProvider"
import { useMartEnabled } from "./featureFlags"

/**
 * The app-style shell (Phase 2). Opt in with ?shell=next.
 *
 * Mirrors the two Flutter shells: Food (presentation/main/main_app_shell.dart)
 * and Mart (quick/ui/shell/app_shell.dart), each with its own tab bar and the
 * raised Food/Mart switch in the middle. Screens are still the current ones;
 * Phases 3-5 swap each for its rebuilt version without touching this shell.
 *
 * `showsBar: false` marks a tab whose current screen has its own fixed bottom
 * bar (the cart's Place Order bar), so ours would cover it. It goes away when
 * that screen is rebuilt.
 */
const TABS = {
  food: {
    home: { path: "/" },
    store99: { path: "/under-250" }, // until Phase 5 builds the 99 Store
    orders: { path: "/orders" },
    profile: { path: "/profile" },
  },
  mart: {
    home: { path: "/in-mart" },
    categories: { path: "/in-mart/categories" },
    cart: { path: "/cart", showsBar: false },
    profile: { path: "/profile" },
  },
}

const toUrl = (rel) => (rel === "/" ? MOUNT : `${MOUNT}${rel}`)

function activeTabFor(mode, relPath) {
  const entry = Object.entries(TABS[mode]).find(([, tab]) => tab.path === relPath)
  return entry ? { id: entry[0], ...entry[1] } : null
}

/**
 * The app hides the bar while scrolling down and brings it back on scroll up or
 * at the top; changing tab always shows it again.
 */
function useHideOnScroll(resetKey) {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    setHidden(false)
    lastY.current = window.scrollY
  }, [resetKey])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const delta = y - lastY.current
      if (y < 40 || delta < -6) setHidden(false)
      else if (delta > 6 && y > 80) setHidden(true)
      if (Math.abs(delta) > 6) lastY.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return hidden
}

/**
 * The app keeps each tab alive (StatefulShellRoute.indexedStack), so going back
 * to a tab finds it where you left it. The current screens fetch on mount and
 * some poll, so keeping them mounted in the background would multiply API
 * calls. Remembering each tab's scroll position gives the same "where I left
 * it" without that cost; everything else scrolls to the top, as before.
 */
function useTabScrollMemory(relPath, isTabRoot) {
  const positions = useRef(new Map())

  useEffect(() => {
    if (!isTabRoot) return undefined
    const onScroll = () => positions.current.set(relPath, window.scrollY)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [relPath, isTabRoot])

  useEffect(() => {
    const saved = isTabRoot ? positions.current.get(relPath) : undefined
    if (!saved) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" })
      return undefined
    }
    // Content may still be loading; try again once it has had a moment.
    const restore = () => window.scrollTo({ top: saved, left: 0, behavior: "instant" })
    const raf = requestAnimationFrame(restore)
    const retry = setTimeout(() => {
      if (Math.abs(window.scrollY - saved) > 4) restore()
    }, 300)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(retry)
    }
  }, [relPath, isTabRoot])
}

function ShellFrame() {
  const navigate = useNavigate()
  const { mode, setMode, relPath } = useAppMode()
  const martEnabled = useMartEnabled()
  const { itemCount = 0 } = useCart()

  const tab = activeTabFor(mode, relPath)
  const showBar = Boolean(tab) && tab.showsBar !== false
  const hidden = useHideOnScroll(relPath)
  useTabScrollMemory(relPath, Boolean(tab))

  const destination = mode === "mart" ? "food" : "mart"
  // As in the app: the way into Mart disappears when Mart is switched off in
  // Admin -> Feature Settings; the way back to Food never does.
  const showSwitch = destination === "food" || martEnabled

  const goTab = (id) => {
    const target = TABS[mode][id]
    if (target) navigate(toUrl(target.path))
  }
  const switchModule = () => {
    setMode(destination)
    navigate(destination === "mart" ? toUrl("/in-mart") : MOUNT)
  }

  return (
    <BrandProvider mode={mode}>
      <LocationPrompt />
      <Outlet />
      {showBar && (
        <>
          <div aria-hidden="true" style={{ height: 88 }} />
          <BottomNav
            key={mode}
            variant={mode}
            fixed
            hidden={hidden}
            activeId={tab.id}
            onSelect={goTab}
            badges={mode === "mart" ? { cart: itemCount } : undefined}
            label={mode === "mart" ? "Mart" : "Food"}
            center={
              showSwitch ? (
                <ModeSwitchButton destination={destination} diameter={mode === "mart" ? 52 : 56} onSwitch={switchModule} />
              ) : null
            }
          />
        </>
      )}
    </BrandProvider>
  )
}

export default function NextLayout() {
  return (
    <UserProviders>
      <AppModeProvider>
        <ShellFrame />
      </AppModeProvider>
    </UserProviders>
  )
}

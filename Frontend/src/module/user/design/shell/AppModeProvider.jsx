import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"

/**
 * Which module the customer is in: Food or Mart.
 *
 * The app keeps this as persisted state (`app.mode`), not something derived
 * from the URL, because shared screens -- Profile, Orders, Cart, Help -- exist
 * once and take on whichever module the customer came from: the same Profile
 * is violet under Food and in the Mart colour under Mart. So a URL that belongs
 * to one module sets the mode; a shared URL keeps the current one.
 */
export const MOUNT = "/food/user"
const KEY = "mv.appMode"

export const relPathOf = (pathname) =>
  pathname.startsWith(MOUNT) ? pathname.slice(MOUNT.length) || "/" : pathname

/** "mart" | "food" for module-owned paths, null for shared screens. */
export function moduleForPath(rel) {
  if (rel === "/in-mart" || rel.startsWith("/in-mart/") || rel.startsWith("/product/")) return "mart"
  if (
    rel === "/" ||
    rel.startsWith("/restaurants") ||
    rel.startsWith("/under-250") ||
    rel.startsWith("/category/") ||
    rel.startsWith("/collections") ||
    rel === "/offers" ||
    rel === "/top-10" ||
    rel === "/gourmet"
  ) {
    return "food"
  }
  return null
}

const readStored = () => {
  try {
    return window.localStorage.getItem(KEY) === "mart" ? "mart" : "food"
  } catch {
    return "food"
  }
}

const AppModeContext = createContext({ mode: "food", setMode: () => {}, relPath: "/" })

export function AppModeProvider({ children }) {
  const { pathname } = useLocation()
  const relPath = relPathOf(pathname)
  const routeMode = moduleForPath(relPath)
  const [stored, setStored] = useState(readStored)

  const setMode = useCallback((next) => {
    const value = next === "mart" ? "mart" : "food"
    try {
      window.localStorage.setItem(KEY, value)
    } catch {
      /* not persisted; still applied for this session */
    }
    setStored(value)
  }, [])

  // Visiting a module's own screen makes it the current module.
  useEffect(() => {
    if (routeMode && routeMode !== stored) setMode(routeMode)
  }, [routeMode, stored, setMode])

  const mode = routeMode ?? stored
  const value = useMemo(() => ({ mode, setMode, relPath }), [mode, setMode, relPath])
  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}

export const useAppMode = () => useContext(AppModeContext)

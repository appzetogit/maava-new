import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { alphaBlend, brandVars, isHex, martAccent, onPlate } from "./color"
import { defaultPaletteId, martDefaultSeed, martSurfaces, palettes } from "./tokens.generated"
import { loadMartSeed, readCachedMartSeed } from "./martSeed"
import { ToastViewport } from "./components/toast"

/**
 * The root of the Maava design system on the web.
 *
 * Mirrors the app's `activeBrandProvider`, which is the single writer of the
 * brand colour: in Food the brand is the palette the customer picked
 * (Profile -> App Theme, violet by default); in Mart it is the colour the
 * operator set in Admin -> Power Scanning -> Mart Module. Shared screens read
 * one brand and so follow whichever module is active.
 *
 * Renders the `.mv` element every token is scoped to, and writes the derived
 * brand shades onto it as custom properties.
 */

const PALETTE_KEY = "mv.appThemeColor" // the app stores this as `app_theme_color`
const THEME_KEY = "appTheme" // shared with the rest of the site: light | dark | system
const THEME_MODES = ["light", "dark", "system"]

const BrandContext = createContext(null)

const readStorage = (key) => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
const writeStorage = (key, value) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* private mode or blocked storage: the choice just won't persist */
  }
}

export function BrandProvider({ mode = "food", className = "", style, children }) {
  const rootRef = useRef(null)

  const [paletteId, setPaletteIdState] = useState(() => {
    const saved = readStorage(PALETTE_KEY)
    return palettes.some((p) => p.id === saved) ? saved : defaultPaletteId
  })
  const [martSeed, setMartSeed] = useState(() => readCachedMartSeed() || martDefaultSeed)
  const [themeMode, setThemeModeState] = useState(() => {
    const saved = readStorage(THEME_KEY)
    return THEME_MODES.includes(saved) ? saved : "light"
  })
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  )

  // The operator's Mart colour: cached value first (no teal flash), then the live one.
  useEffect(() => {
    let alive = true
    loadMartSeed().then((seed) => {
      if (alive && isHex(seed)) setMartSeed(seed)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)")
    if (!mq) return undefined
    const onChange = (e) => setSystemDark(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const isDark = themeMode === "dark" || (themeMode === "system" && systemDark)

  // The site already switches dark mode with a class on <html> (index.jsx,
  // Profile.jsx); the tokens key off the same class so there is one switch.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
  }, [isDark])

  const setPalette = useCallback((id) => {
    if (!palettes.some((p) => p.id === id)) return
    writeStorage(PALETTE_KEY, id)
    setPaletteIdState(id)
  }, [])

  const setThemeMode = useCallback((next) => {
    if (!THEME_MODES.includes(next)) return
    writeStorage(THEME_KEY, next)
    setThemeModeState(next)
  }, [])

  const vars = useMemo(() => {
    if (mode === "mart") {
      return {
        ...brandVars(martSeed, martAccent(martSeed)),
        "--mv-on-brand": onPlate(martSeed, martSurfaces.ink),
        "--mv-brand-surface-soft-light": alphaBlend(martSeed, 0.12, martSurfaces.light),
        "--mv-brand-surface-soft-dark": alphaBlend(martSeed, 0.12, martSurfaces.darkBackground),
      }
    }
    const palette = palettes.find((p) => p.id === paletteId) || palettes[0]
    return brandVars(palette.color, palette.button)
  }, [mode, paletteId, martSeed])

  const value = useMemo(
    () => ({
      mode,
      palettes,
      paletteId,
      setPalette,
      martSeed,
      themeMode,
      setThemeMode,
      isDark,
      brand: vars["--mv-brand"],
      foodBrand: (palettes.find((p) => p.id === paletteId) || palettes[0]).color,
      rootRef,
    }),
    [mode, paletteId, setPalette, martSeed, themeMode, setThemeMode, isDark, vars],
  )

  return (
    <BrandContext.Provider value={value}>
      <div ref={rootRef} className={`mv ${className}`.trim()} data-mv-mode={mode} style={{ ...vars, ...style }}>
        {children}
        <ToastViewport />
      </div>
    </BrandContext.Provider>
  )
}

export function useBrand() {
  const ctx = useContext(BrandContext)
  if (!ctx) throw new Error("useBrand must be used inside <BrandProvider>")
  return ctx
}

/** For overlays that portal: they must land inside `.mv` or they lose every token. */
export function useMvRoot() {
  return useContext(BrandContext)?.rootRef ?? null
}

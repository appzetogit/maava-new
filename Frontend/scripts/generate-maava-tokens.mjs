#!/usr/bin/env node
/**
 * Generates the website's Maava design tokens from the Flutter app's theme source.
 *
 *   npm run tokens:maava
 *
 * The Flutter app is the visual source of truth. Copying its hexes by hand is
 * how the two drifted apart in the first place, so this reads the Dart files
 * directly and writes two checked-in outputs:
 *
 *   src/module/user/design/tokens.generated.css   custom properties + type roles
 *   src/module/user/design/tokens.generated.js    the same data for JS (palettes, etc.)
 *
 * The outputs are committed because the production build server does not have
 * the Flutter source. Re-run this whenever the app's theme files change; it
 * fails loudly if a token it depends on disappears rather than emitting a
 * silently incomplete theme.
 *
 * Flutter source: ../../../../maava/lib/src (override with MAAVA_FLUTTER_SRC).
 */
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.resolve(here, "..")
const FLUTTER = process.env.MAAVA_FLUTTER_SRC || path.resolve(FRONTEND, "../../../maava/lib/src")
const OUT_DIR = path.join(FRONTEND, "src/module/user/design")

const { brandVars, martAccent, onPlate, alphaBlend } = await import(
  pathToFileURL(path.join(OUT_DIR, "color.js")).href
)

const SOURCES = {
  foodColors: "presentation/branding/app_colors.dart",
  foodText: "presentation/branding/app_text_styles.dart",
  foodTheme: "presentation/branding/app_theme.dart",
  palettes: "presentation/branding/theme_color_provider.dart",
  martColors: "quick/core/theme/app_colors.dart",
  martText: "quick/core/theme/app_text_styles.dart",
}

const src = {}
for (const [key, rel] of Object.entries(SOURCES)) {
  const file = path.join(FLUTTER, rel)
  if (!fs.existsSync(file)) {
    console.error(`Missing Flutter source: ${file}\nSet MAAVA_FLUTTER_SRC to the app's lib/src directory.`)
    process.exit(1)
  }
  src[key] = fs.readFileSync(file, "utf8")
}

const hex8 = (v) => `#${v.slice(2).toUpperCase()}`
const need = (obj, key, where) => {
  if (!(key in obj)) {
    console.error(`Token "${key}" not found in ${where}. The Flutter theme changed shape; update this generator.`)
    process.exit(1)
  }
  return obj[key]
}

// ---- Food colours: `static (const) Color name = (const) Color(0xAARRGGBB);`
const food = {}
for (const m of src.foodColors.matchAll(/static\s+(?:const\s+)?Color\s+(\w+)\s*=\s*(?:const\s+)?Color\(0x([0-9A-Fa-f]{8})\)/g)) {
  food[m[1]] = hex8(m[2])
}

// ---- Mart colours: `static const name = Color(0xAARRGGBB);` inside AppColors.
const martClass = src.martColors.split(/class\s+QuickBrand/)[0]
const mart = {}
for (const m of martClass.matchAll(/static\s+const\s+(\w+)\s*=\s*Color\(0x([0-9A-Fa-f]{8})\)/g)) {
  mart[m[1]] = hex8(m[2])
}

// Mart dark semantic colours are literals inside AppSemanticColors.dark.
const darkFactory = (src.martColors.split("factory AppSemanticColors.dark")[1] || "").split(/factory\s|@override/)[0]
const martDarkSemantic = {}
for (const m of darkFactory.matchAll(/(\w+):\s*const\s+Color\(0x([0-9A-Fa-f]{8})\)/g)) {
  martDarkSemantic[m[1]] = hex8(m[2])
}

// ---- App Theme palettes: `violet('Violet', Color(0x..), Color(0x..), '🟣'),`
const palettes = []
for (const m of src.palettes.matchAll(/(\w+)\('([^']+)',\s*Color\(0x([0-9A-Fa-f]{8})\),\s*Color\(0x([0-9A-Fa-f]{8})\)/g)) {
  palettes.push({ id: m[1], label: m[2], color: hex8(m[3]), button: hex8(m[4]) })
}
if (!palettes.length) {
  console.error("No AppThemeColor palettes found in theme_color_provider.dart.")
  process.exit(1)
}

// ---- Theme geometry: `const double _borderRadius = 22.0;`
const geometry = {}
for (const m of src.foodTheme.matchAll(/const\s+double\s+(_\w+)\s*=\s*([\d.]+)/g)) {
  geometry[m[1]] = Number(m[2])
}
const inputRadius = Number((src.foodTheme.match(/OutlineInputBorder\(\s*borderRadius:\s*BorderRadius\.circular\(([\d.]+)\)/) || [])[1])

// ---- Type roles from the Mart text theme, which carries line-height and tracking.
const weight = { bold: 700, normal: 400, w300: 300, w400: 400, w500: 500, w600: 600, w700: 700, w800: 800 }
const typeRoles = {}
for (const m of src.martText.matchAll(/(\w+):\s*s\(([\d.]+),\s*FontWeight\.(\w+)([^)]*)\)/g)) {
  const rest = m[4]
  const lh = (rest.match(/height:\s*([\d.]+)/) || [])[1]
  const ls = (rest.match(/spacing:\s*(-?[\d.]+)/) || [])[1]
  typeRoles[m[1]] = {
    size: Number(m[2]),
    weight: weight[m[3]] ?? 400,
    lineHeight: lh ? Number(lh) : 1.3,
    letterSpacing: ls ? Number(ls) : 0,
    muted: /color:\s*secondary/.test(rest),
  }
}
for (const role of ["displayLarge", "displayMedium", "displaySmall", "headlineMedium", "bodyLarge", "bodyMedium", "bodySmall", "labelLarge", "labelSmall"]) {
  need(typeRoles, role, SOURCES.martText)
}

// ---- Assemble the CSS.
const F = (k) => need(food, k, SOURCES.foodColors)
const M = (k) => need(mart, k, SOURCES.martColors)
const D = (k) => need(martDarkSemantic, k, "AppSemanticColors.dark")

const defaultPalette = palettes[0]
const foodBrand = brandVars(defaultPalette.color, defaultPalette.button)
const martSeed = M("tealPrimary")
const martBrand = {
  ...brandVars(martSeed, martAccent(martSeed)),
  "--mv-on-brand": onPlate(martSeed, M("lightTextPrimary")),
}

const block = (selector, vars) =>
  `${selector} {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}\n`

const foodLight = {
  "--mv-bg": F("backgroundLight"),
  "--mv-surface": F("surfaceLight"),
  "--mv-surface-2": F("secondarySurfaceLight"),
  "--mv-container": F("lightContainer"),
  "--mv-card": F("cardLight"),
  "--mv-muted-bg": F("lightGreyBg"),
  "--mv-text": F("textPrimaryLight"),
  "--mv-text-2": F("textSecondaryLight"),
  "--mv-border": F("borderLight"),
  "--mv-border-subtle": F("borderSubtle"),
  "--mv-divider": F("dividerLight"),
  "--mv-success": F("success"),
  "--mv-success-soft": M("successSoft"),
  "--mv-warning": M("warning"),
  "--mv-warning-soft": M("warningSoft"),
  "--mv-danger": F("error"),
  "--mv-danger-soft": M("dangerSoft"),
  "--mv-rating": F("rating"),
  "--mv-star": F("ratingStar"),
  "--mv-accent-pink": F("accentPink"),
  "--mv-accent-blue": F("accentBlue"),
  "--mv-veg": "#2E7D32",
  "--mv-non-veg": M("nonVeg"),
  "--mv-badge": "#EF4444",
  "--mv-shadow-card": "0 8px 20px rgb(0 0 0 / 0.08)",
  "--mv-shadow-item": "0 4px 10px rgb(0 0 0 / 0.05)",
  "--mv-shadow-sheet": "0 -8px 32px rgb(16 22 19 / 0.10)",
  "--mv-brand-wash": "var(--mv-brand-tint)",
  "--mv-brand-fill": "var(--mv-brand-tint-strong)",
}
const foodDark = {
  "--mv-bg": F("backgroundDark"),
  "--mv-surface": F("surfaceDark"),
  "--mv-surface-2": F("darkContainer"),
  "--mv-container": F("darkContainer"),
  "--mv-card": F("cardDark"),
  "--mv-muted-bg": F("darkContainer"),
  "--mv-text": F("textPrimaryDark"),
  "--mv-text-2": F("textSecondaryDark"),
  "--mv-border": F("borderDark"),
  "--mv-border-subtle": F("darkBorder"),
  "--mv-divider": F("borderDark"),
  "--mv-success-soft": D("successSoft"),
  "--mv-warning": D("warning"),
  "--mv-warning-soft": D("warningSoft"),
  "--mv-danger-soft": D("dangerSoft"),
  "--mv-shadow-card": "none",
  "--mv-shadow-item": "none",
  "--mv-shadow-sheet": "0 -8px 32px rgb(0 0 0 / 0.5)",
  "--mv-brand-wash": "var(--mv-brand-tint-dark)",
  "--mv-brand-fill": "var(--mv-brand-tint-dark-strong)",
}
// Mart repaints surfaces with its own palette (quick/core/theme/app_colors.dart).
const martLight = {
  "--mv-bg": M("lightBackground"),
  "--mv-surface": M("lightSurface"),
  "--mv-surface-2": M("lightSurfaceAlt"),
  "--mv-card": M("lightSurface"),
  "--mv-text": M("lightTextPrimary"),
  "--mv-text-2": M("lightTextSecondary"),
  "--mv-border": M("lightBorder"),
  "--mv-success": M("success"),
  "--mv-danger": M("danger"),
  "--mv-rating": M("rating"),
  "--mv-mart-yellow": M("brandYellow"),
  "--mv-mart-yellow-soft": M("brandYellowSoft"),
  "--mv-mart-orange": M("brandOrange"),
  "--mv-shadow-card": "0 4px 16px rgb(16 22 19 / 0.06)",
  // Both variants are published on the light block so the runtime can
  // recompute them for the operator's seed; each theme picks its own.
  "--mv-brand-surface-soft-light": alphaBlend(martSeed, 0.12, M("lightSurface")),
  "--mv-brand-surface-soft-dark": alphaBlend(martSeed, 0.12, M("darkBackground")),
  "--mv-brand-surface-soft": "var(--mv-brand-surface-soft-light)",
}
const martDark = {
  "--mv-bg": M("darkBackground"),
  "--mv-surface": M("darkSurface"),
  "--mv-surface-2": M("darkSurfaceAlt"),
  "--mv-card": M("darkSurface"),
  "--mv-text": M("darkTextPrimary"),
  "--mv-text-2": M("darkTextSecondary"),
  "--mv-border": M("darkBorder"),
  "--mv-success": D("success"),
  "--mv-danger": D("danger"),
  "--mv-mart-yellow-soft": M("brandYellowSoftDark"),
  "--mv-shadow-card": "0 6px 18px rgb(0 0 0 / 0.4)",
  "--mv-brand-surface-soft": "var(--mv-brand-surface-soft-dark)",
}

const geometryVars = {
  "--mv-font": `"Poppins", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  "--mv-radius-card": `${need(geometry, "_borderRadius", SOURCES.foodTheme)}px`,
  "--mv-radius-button": `${need(geometry, "_buttonBorderRadius", SOURCES.foodTheme)}px`,
  "--mv-radius-input": `${inputRadius || 18}px`,
  "--mv-button-height": `${need(geometry, "_buttonHeight", SOURCES.foodTheme)}px`,
}

const toKebab = (s) => s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()
const typeCss = Object.entries(typeRoles)
  .map(([role, t]) =>
    `.mv .mv-${toKebab(role)} {\n  font-family: var(--mv-font);\n  font-size: ${t.size}px;\n  font-weight: ${t.weight};\n  line-height: ${t.lineHeight};\n  letter-spacing: ${t.letterSpacing}px;${t.muted ? "\n  color: var(--mv-text-2);" : ""}\n}\n`,
  )
  .join("\n")

const hashes = Object.fromEntries(
  Object.entries(src).map(([k, v]) => [SOURCES[k], crypto.createHash("sha1").update(v).digest("hex").slice(0, 10)]),
)
const banner = `/* GENERATED by scripts/generate-maava-tokens.mjs from the Maava Flutter app.
 * Do not edit by hand -- change the Dart theme files, then run \`npm run tokens:maava\`.
 * Sources: ${Object.entries(hashes).map(([f, h]) => `${f}@${h}`).join(", ")}
 */\n`

const css = [
  banner,
  "/* Food (default) -- light */",
  block(".mv", { ...geometryVars, ...foodLight, ...foodBrand }),
  "/* Food -- dark. The site toggles dark mode with a .dark class on <html>. */",
  block(".dark .mv, .mv.dark", foodDark),
  "/* Mart -- the operator's colour arrives at runtime; teal is the shipped default. */",
  block('.mv[data-mv-mode="mart"]', { ...martLight, ...martBrand }),
  block('.dark .mv[data-mv-mode="mart"], .mv.dark[data-mv-mode="mart"]', martDark),
  "/* Type roles (Material 3 names, as the app uses them). */",
  typeCss,
].join("\n")

const js = `${banner.replace(/\/\*/, "/**")}
export const palettes = ${JSON.stringify(palettes, null, 2)}

export const defaultPaletteId = ${JSON.stringify(defaultPalette.id)}

export const martDefaultSeed = ${JSON.stringify(martSeed)}

export const typeRoles = ${JSON.stringify(typeRoles, null, 2)}

export const geometry = ${JSON.stringify(geometryVars, null, 2)}

export const martSurfaces = ${JSON.stringify({ light: M("lightSurface"), darkBackground: M("darkBackground"), ink: M("lightTextPrimary") }, null, 2)}
`

fs.writeFileSync(path.join(OUT_DIR, "tokens.generated.css"), css)
fs.writeFileSync(path.join(OUT_DIR, "tokens.generated.js"), js)
console.log(
  `tokens: ${Object.keys(food).length} food colours, ${Object.keys(mart).length} mart colours, ` +
    `${palettes.length} palettes, ${Object.keys(typeRoles).length} type roles -> ${path.relative(FRONTEND, OUT_DIR)}`,
)

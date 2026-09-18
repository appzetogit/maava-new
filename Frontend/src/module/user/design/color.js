/**
 * Colour maths for the Maava design system, ported from Flutter.
 *
 * The app derives every brand tint -- badge fills, tinted borders, dark-mode
 * containers -- from ONE brand colour with Flutter's HSLColor, and the web has
 * to produce the same hexes or the two drift the moment someone picks a theme.
 * So these are line-for-line ports of Flutter's own algorithms, not "an HSL
 * implementation": HSLColor.fromColor, HSLColor.toColor (_colorFromHue),
 * Color.computeLuminance and Color.alphaBlend, including where Flutter rounds.
 *
 * Plain ESM with no dependencies: the token generator (Node) and the browser
 * runtime both import it, so build-time defaults and runtime values agree.
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function hexToRgb(hex) {
  const raw = String(hex || "").trim().replace(/^#/, "")
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null
  const n = parseInt(raw, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }) {
  const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

export function isHex(value) {
  return hexToRgb(value) !== null
}

/** Flutter HSLColor.fromColor. Hue in degrees, saturation/lightness 0..1. */
export function rgbToHsl({ r, g, b }) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  let hue = 0
  if (max !== 0 && delta !== 0) {
    // Dart's % on doubles is Euclidean (never negative); JS's is not.
    const mod = (a, n) => ((a % n) + n) % n
    if (max === red) hue = 60 * mod((green - blue) / delta, 6)
    else if (max === green) hue = 60 * ((blue - red) / delta + 2)
    else hue = 60 * ((red - green) / delta + 4)
  }
  if (Number.isNaN(hue)) hue = 0

  const lightness = (max + min) / 2
  const saturation =
    lightness === 1 ? 0 : clamp(delta / (1 - Math.abs(2 * lightness - 1)), 0, 1)
  return { h: hue, s: saturation, l: lightness }
}

/** Flutter HSLColor.toColor (_colorFromHue), rounding the way Color.fromARGB does. */
export function hslToRgb({ h, s, l }) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const secondary = chroma * (1 - Math.abs((hp % 2) - 1))
  const match = l - chroma / 2

  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [chroma, secondary, 0]
  else if (h < 120) [r, g, b] = [secondary, chroma, 0]
  else if (h < 180) [r, g, b] = [0, chroma, secondary]
  else if (h < 240) [r, g, b] = [0, secondary, chroma]
  else if (h < 300) [r, g, b] = [secondary, 0, chroma]
  else [r, g, b] = [chroma, 0, secondary]

  return {
    r: Math.round((r + match) * 255),
    g: Math.round((g + match) * 255),
    b: Math.round((b + match) * 255),
  }
}

/** Flutter Color.computeLuminance (WCAG relative luminance). */
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  const lin = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Flutter Color.alphaBlend of `fg` at `alpha` over an opaque `bg`. */
export function alphaBlend(fgHex, alpha, bgHex) {
  const f = hexToRgb(fgHex)
  const b = hexToRgb(bgHex)
  const mix = (x, y) => Math.round(x * alpha + y * (1 - alpha))
  return rgbToHex({ r: mix(f.r, b.r), g: mix(f.g, b.g), b: mix(f.b, b.b) })
}

function shade(hsl, lightness, saturation) {
  return rgbToHex(hslToRgb({ h: hsl.h, s: saturation, l: lightness }))
}

/**
 * The derived shades from presentation/branding/app_colors.dart. Every
 * constant below is copied from that file -- change them there first.
 */
export function deriveBrandShades(primaryHex) {
  const hsl = rgbToHsl(hexToRgb(primaryHex))
  const s = hsl.s
  return {
    light: shade(hsl, clamp(hsl.l + 0.12, 0, 0.8), s),
    deep: shade(hsl, 0.42, s),
    deepText: shade(hsl, 0.3, clamp(s * 0.85, 0, 0.9)),
    tint: shade(hsl, 0.96, clamp(s * 0.9, 0, 1)),
    tintStrong: shade(hsl, 0.91, clamp(s * 0.9, 0, 1)),
    soft: shade(hsl, 0.8, clamp(s * 0.9, 0, 1)),
    tintDark: shade(hsl, 0.12, clamp(s * 0.35, 0, 0.45)),
    tintDarkStrong: shade(hsl, 0.2, clamp(s * 0.4, 0, 0.5)),
  }
}

/** Legible ink on a brand plate -- quick/core/theme/app_colors.dart onPlate. */
export function onPlate(plateHex, darkInk = "#181C2E") {
  return luminance(plateHex) > 0.45 ? darkInk : "#FFFFFF"
}

/** QuickBrand.fromSeed: the accent is the seed 0.12 lighter-darker, not configured. */
export function martAccent(seedHex) {
  const hsl = rgbToHsl(hexToRgb(seedHex))
  return rgbToHex(hslToRgb({ ...hsl, l: clamp(hsl.l - 0.12, 0, 1) }))
}

/**
 * Everything the CSS needs for one brand, as custom-property values.
 * `button` is the palette's own button colour in Food, the derived accent in Mart.
 */
export function brandVars(primaryHex, buttonHex) {
  const shades = deriveBrandShades(primaryHex)
  const { r, g, b } = hexToRgb(primaryHex)
  return {
    "--mv-brand": primaryHex.toUpperCase(),
    "--mv-brand-rgb": `${r} ${g} ${b}`,
    "--mv-brand-button": buttonHex.toUpperCase(),
    "--mv-brand-light": shades.light,
    "--mv-brand-deep": shades.deep,
    "--mv-brand-deep-text": shades.deepText,
    "--mv-brand-tint": shades.tint,
    "--mv-brand-tint-strong": shades.tintStrong,
    "--mv-brand-soft": shades.soft,
    "--mv-brand-tint-dark": shades.tintDark,
    "--mv-brand-tint-dark-strong": shades.tintDarkStrong,
    "--mv-on-brand": onPlate(primaryHex),
  }
}

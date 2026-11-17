import { useBrand } from "../BrandProvider"

/** Profile -> App Theme: the app's eight presets, persisted like the app does. */
export function PalettePicker({ label = "App theme" }) {
  const { palettes, paletteId, setPalette } = useBrand()
  return (
    <div role="radiogroup" aria-label={label} className="mv-palettes">
      {palettes.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={p.id === paletteId}
          className="mv-palette"
          style={{ "--mv-swatch": p.color }}
          onClick={() => setPalette(p.id)}
        >
          <span className="mv-palette__swatch" style={{ background: p.color }} aria-hidden="true" />
          {p.label}
        </button>
      ))}
    </div>
  )
}

import { forwardRef, useId } from "react"
import { ChevronRight, Mic, Search, Star } from "lucide-react"

export const cx = (...parts) => parts.filter(Boolean).join(" ")

export function Spinner({ size = 20, className }) {
  return <span className={cx("mv-spinner", className)} style={{ width: size, height: size }} aria-hidden="true" />
}

/**
 * variant: primary (PrimaryButton -- brand, r16) | pill (theme ElevatedButton -- r24)
 *          | outline | soft | ghost
 * size:    lg (56, the app's button height) | md | sm
 */
export const Button = forwardRef(function Button(
  { variant = "primary", size = "lg", block = true, loading = false, disabled, leading, trailing, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("mv-btn", `mv-btn--${variant}`, `mv-btn--${size}`, block && "mv-btn--block", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Spinner size={22} />
      ) : (
        <>
          {leading}
          <span>{children}</span>
          {trailing}
        </>
      )}
    </button>
  )
})

/** variant: plain | surface (floating card circle) | brand | scrim (over photos) */
export const IconButton = forwardRef(function IconButton(
  { label, variant = "plain", className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={cx("mv-icon-btn", `mv-icon-btn--${variant}`, className)} {...rest}>
      {children}
    </button>
  )
})

/** variant: filled (CustomTextField, r16, no border) | outlined (theme input, r18, bordered) */
export const TextField = forwardRef(function TextField(
  { label, hint, error, leading, trailing, variant = "filled", className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id || autoId
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
  return (
    <div className={cx("mv-field", `mv-field--${variant}`, error && "mv-field--error", className)}>
      {label && (
        <label className="mv-field__label" htmlFor={fieldId}>
          {label}
        </label>
      )}
      <div className="mv-field__box">
        {leading && <span className="mv-field__icon">{leading}</span>}
        <input
          ref={ref}
          id={fieldId}
          className="mv-field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {trailing && <span className="mv-field__icon">{trailing}</span>}
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="mv-field__error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mv-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

export function SearchBar({ value, onChange, onSubmit, placeholder = 'Search for "dosa"', onVoice, className, inputProps }) {
  return (
    <form
      role="search"
      className={cx("mv-search", className)}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(value)
      }}
    >
      <Search aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label="Search restaurants and dishes"
        {...inputProps}
      />
      {onVoice && (
        <>
          <span className="mv-search__divider" aria-hidden="true" />
          <IconButton label="Search by voice" onClick={onVoice}>
            <Mic />
          </IconButton>
        </>
      )}
    </form>
  )
}

export function Card({ as: Tag = "div", padded = false, interactive = false, className, children, ...rest }) {
  return (
    <Tag className={cx("mv-card", padded && "mv-card--padded", interactive && "mv-card--interactive", className)} {...rest}>
      {children}
    </Tag>
  )
}

export function Chip({ selected = false, leading, className, children, ...rest }) {
  return (
    <button type="button" aria-pressed={selected} className={cx("mv-chip", className)} {...rest}>
      {leading}
      {children}
    </button>
  )
}

/** tone: brand | solid | success | warning | danger | neutral | free */
export function Badge({ tone = "brand", icon, className, children }) {
  return (
    <span className={cx("mv-badge", `mv-badge--${tone}`, className)}>
      {icon}
      {children}
    </span>
  )
}

export function RatingPill({ value }) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return (
    <span className="mv-rating" aria-label={`Rated ${n.toFixed(1)} out of 5`}>
      <Star aria-hidden="true" />
      {n.toFixed(1)}
    </span>
  )
}

export function VegMark({ veg = true }) {
  return (
    <span className={cx("mv-veg", !veg && "mv-veg--non")} role="img" aria-label={veg ? "Veg" : "Non-veg"}>
      <i />
    </span>
  )
}

export function SectionHeader({ title, actionLabel = "See all", onAction, as: Tag = "h2" }) {
  return (
    <div className="mv-section-head">
      <Tag className="mv-title-large">{title}</Tag>
      {onAction && (
        <button type="button" className="mv-section-head__action" onClick={onAction}>
          {actionLabel}
          <ChevronRight aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export function ListGroup({ children, className }) {
  return <div className={cx("mv-list", className)}>{children}</div>
}

export function ListRow({ icon, title, subtitle, end, chevron = true, as: Tag = "button", className, ...rest }) {
  return (
    <Tag type={Tag === "button" ? "button" : undefined} className={cx("mv-row", className)} {...rest}>
      {icon && <span className="mv-row__icon">{icon}</span>}
      <span className="mv-row__text">
        <span className="mv-row__title">{title}</span>
        {subtitle && <span className="mv-row__sub">{subtitle}</span>}
      </span>
      {(end || chevron) && (
        <span className="mv-row__end">
          {end}
          {chevron && <ChevronRight aria-hidden="true" />}
        </span>
      )}
    </Tag>
  )
}

export function SegmentedControl({ label, options, value, onChange, className }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("mv-seg", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          onClick={() => onChange?.(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

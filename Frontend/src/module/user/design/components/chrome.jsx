import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, House, LayoutGrid, ReceiptText, ShoppingBag, ShoppingBasket, ShoppingCart, User, Utensils, X } from "lucide-react"
import { cx, IconButton } from "./primitives"
import { useBrand, useMvRoot } from "../BrandProvider"

export function AppBar({ title, onBack, backLabel = "Back", actions, transparent = false, className }) {
  return (
    <header className={cx("mv-appbar", transparent && "mv-appbar--transparent", className)}>
      <div className="mv-appbar__side">
        {onBack && (
          <IconButton label={backLabel} onClick={onBack}>
            <ArrowLeft />
          </IconButton>
        )}
      </div>
      <h1 className="mv-appbar__title">{title}</h1>
      <div className="mv-appbar__side mv-appbar__side--end">{actions}</div>
    </header>
  )
}

/** Tabs exactly as the app renders them (presentation/main/widgets/custom_bottom_nav.dart). */
export const FOOD_TABS = [
  { id: "home", label: "Home", icon: House },
  { id: "store99", label: "99 Store", icon: ShoppingBag },
  { id: "orders", label: "Orders", icon: ReceiptText },
  { id: "profile", label: "Profile", icon: User },
]

/** Mart shell (quick/ui/shell/app_shell.dart). The switch back to Food sits in the centre slot. */
export const MART_TABS = [
  { id: "home", label: "Home", icon: House },
  { id: "categories", label: "Categories", icon: LayoutGrid },
  { id: "cart", label: "Cart", icon: ShoppingCart },
  { id: "profile", label: "Profile", icon: User },
]

/**
 * variant "food": 11px labels, w800 when active, #757575 idle, top hairline + soft shadow.
 * variant "mart": 10.5px labels, a 16x3 underline under the active tab, red count badge.
 * `center` goes between the two halves of the bar -- where the app puts the
 * raised Food/Mart switch. `fixed` pins it to the viewport; `hidden` slides
 * it away (the app hides the bar while scrolling down).
 * Items may carry `href` (rendered through `renderLink`) or call onSelect.
 */
export function BottomNav({
  variant = "food",
  items = variant === "mart" ? MART_TABS : FOOD_TABS,
  activeId,
  onSelect,
  badges = {},
  renderLink,
  center,
  fixed = false,
  hidden = false,
  label = "Main",
}) {
  const renderItem = (item) => {
    const Icon = item.icon
    const current = item.id === activeId
    const count = Number(badges[item.id] || 0)
    const content = (
      <>
        <span className="mv-nav__icon">
          <Icon aria-hidden="true" strokeWidth={current ? 2.4 : 2} />
          {count > 0 && <span className="mv-nav__badge">{count > 99 ? "99+" : count}</span>}
        </span>
        <span className="mv-nav__label">{item.label}</span>
        {variant === "mart" && <span className="mv-nav__bar" aria-hidden="true" />}
      </>
    )
    const common = {
      className: "mv-nav__item",
      "aria-current": current ? "page" : undefined,
      "aria-label": count > 0 ? `${item.label}, ${count} item${count === 1 ? "" : "s"}` : undefined,
    }
    if (item.href && renderLink) {
      return (
        <span key={item.id} style={{ display: "contents" }}>
          {renderLink({ ...common, href: item.href, children: content })}
        </span>
      )
    }
    return (
      <button key={item.id} type="button" {...common} onClick={() => onSelect?.(item.id)}>
        {content}
      </button>
    )
  }

  const half = Math.ceil(items.length / 2)
  return (
    <nav
      className={cx("mv-nav", `mv-nav--${variant}`, fixed && "mv-nav--fixed", hidden && "mv-nav--hidden")}
      aria-label={label}
      inert={hidden || undefined}
    >
      {items.slice(0, half).map(renderItem)}
      {center && <span className="mv-nav__center">{center}</span>}
      {items.slice(half).map(renderItem)}
    </nav>
  )
}

/**
 * ModeSwitchButton (presentation/mode/mode_switch_button.dart): a raised disc
 * in the Food theme colour, 3px ring in the page colour, lifted 14px out of
 * the bar. It shows where it takes you, not where you are -- a basket and
 * "Mart" in Food, a plate and "Food" in Mart.
 */
export function ModeSwitchButton({ destination = "mart", onSwitch, color, diameter = 56 }) {
  const { foodBrand } = useBrand()
  const Icon = destination === "mart" ? ShoppingBasket : Utensils
  const label = destination === "mart" ? "Mart" : "Food"
  return (
    <button
      type="button"
      className="mv-mode-switch"
      style={{ "--mv-switch-size": `${diameter}px`, "--mv-switch-color": color || foodBrand }}
      onClick={onSwitch}
      aria-label={`Switch to ${label}`}
    >
      <span className="mv-mode-switch__disc">
        <Icon key={destination} aria-hidden="true" />
      </span>
      <span className="mv-mode-switch__label" aria-hidden="true">
        {label}
      </span>
    </button>
  )
}

/**
 * Bottom sheet: 24 top radius, 40x4 handle, backdrop tap and Escape close it,
 * focus moves in and returns on close. Portals into the `.mv` root so it keeps
 * the brand tokens.
 */
export function BottomSheet({ open, onClose, title, children, footer }) {
  const rootRef = useMvRoot()
  const sheetRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.()
    }
    document.addEventListener("keydown", onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = "hidden"
    requestAnimationFrame(() => {
      const target = sheetRef.current?.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
      ;(target || sheetRef.current)?.focus()
    })
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  const sheet = (
    <div className="mv-sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="mv-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mv-sheet__handle" aria-hidden="true" />
        {title && (
          <div className="mv-sheet__head">
            <h2 id={titleId} className="mv-sheet__title">
              {title}
            </h2>
            <IconButton label="Close" onClick={onClose}>
              <X />
            </IconButton>
          </div>
        )}
        {children}
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  )
  return rootRef?.current ? createPortal(sheet, rootRef.current) : sheet
}

/** EmptyStateWidget: 64px icon in a card-coloured circle, 20 bold title, 14 subtitle at 70%. */
export function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="mv-empty">
      {Icon && (
        <span className="mv-empty__icon">
          <Icon aria-hidden="true" />
        </span>
      )}
      <h2 className="mv-empty__title">{title}</h2>
      {subtitle && <p className="mv-empty__sub">{subtitle}</p>}
      {action && <div className="mv-empty__action">{action}</div>}
    </div>
  )
}

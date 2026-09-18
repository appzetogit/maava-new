import { useEffect, useRef, useState } from "react"
import { ChevronRight, Clock, Heart, Leaf, Minus, Plus, Sparkles, Tag } from "lucide-react"
import { cx, IconButton, RatingPill, VegMark } from "./primitives"
import { SmartImage } from "./media"

const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

/**
 * RestaurantCard (home/widgets/restaurant_card.dart).
 * 20 radius, soft drop shadow in light and none in dark, a swipeable image
 * strip, then name / rating / time + price for one / offer / cuisines /
 * "Must Try". A closed restaurant renders in greyscale and ignores taps,
 * exactly as the app does.
 */
export function RestaurantCard({
  name,
  images = [],
  rating,
  deliveryTime,
  priceForOne,
  offer,
  cuisines = [],
  isPureVeg = false,
  mustTry,
  isOpen = true,
  isFavorite = false,
  onToggleFavorite,
  onOpen,
  index = 0,
}) {
  const [slide, setSlide] = useState(0)
  const slidesRef = useRef(null)
  const slides = images.length ? images : [null]

  const onScroll = () => {
    const el = slidesRef.current
    if (el) setSlide(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
  }
  const open = () => {
    if (isOpen) onOpen?.()
  }

  return (
    <article
      className={cx("mv-rcard", !isOpen && "mv-rcard--closed")}
      style={{ "--mv-delay": `${(index % 6) * 60}ms` }}
      onClick={open}
      aria-disabled={!isOpen || undefined}
    >
      <div className="mv-rcard__media">
        <div ref={slidesRef} className="mv-rcard__slides" onScroll={onScroll}>
          {slides.map((img, i) => (
            <SmartImage key={i} src={img} alt={i === 0 ? name : ""} eager={index < 2 && i === 0} />
          ))}
        </div>
        <div className="mv-rcard__scrim" />
        {priceForOne > 0 && <span className="mv-rcard__caption">{rupees(priceForOne)} for one</span>}
        {slides.length > 1 && (
          <div className="mv-rcard__dots" aria-hidden="true">
            {slides.map((_, i) => (
              <i key={i} data-on={i === slide ? "" : undefined} />
            ))}
          </div>
        )}
        {onToggleFavorite && (
          <IconButton
            label={isFavorite ? `Remove ${name} from favourites` : `Save ${name} to favourites`}
            variant="scrim"
            className="mv-rcard__fav"
            aria-pressed={isFavorite}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite()
            }}
          >
            <Heart />
          </IconButton>
        )}
      </div>

      <div className="mv-rcard__body">
        <div className="mv-rcard__title-row">
          <h3 style={{ minWidth: 0, display: "flex" }}>
            <button type="button" className="mv-rcard__name" onClick={open} disabled={!isOpen}>
              {name}
            </button>
          </h3>
          <RatingPill value={rating} />
        </div>

        <div className="mv-rcard__meta">
          {deliveryTime && (
            <span>
              <Clock aria-hidden="true" />
              {deliveryTime}
            </span>
          )}
          {deliveryTime && priceForOne > 0 && <i className="mv-rcard__sep" aria-hidden="true" />}
          {priceForOne > 0 && <span>{rupees(priceForOne)} for one</span>}
        </div>

        {offer && (
          <div className="mv-rcard__offer">
            <Tag aria-hidden="true" />
            {offer}
          </div>
        )}

        {(cuisines.length > 0 || isPureVeg) && (
          <div className="mv-rcard__cuisines">
            {cuisines.length > 0 && <span>{cuisines.join("  •  ")}</span>}
            {isPureVeg && (
              <span className="mv-rcard__pureveg">
                <Leaf aria-hidden="true" />
                Pure Veg
              </span>
            )}
          </div>
        )}

        {!isOpen ? (
          <div className="mv-rcard__closed" role="status">
            <Clock aria-hidden="true" />
            <div>
              <b>Delivery is currently unavailable.</b>
              <span>It will accept orders once it reopens.</span>
            </div>
          </div>
        ) : (
          mustTry && (
            <div className="mv-rcard__musttry">
              <Sparkles aria-hidden="true" />
              <b>Must Try •</b>
              <span>
                {mustTry.name}
                {mustTry.price > 0 ? ` • ${rupees(mustTry.price)}` : ""}
              </span>
            </div>
          )
        )}
      </div>
    </article>
  )
}

/**
 * The add button that grows into a stepper (food_item_card.dart):
 * 36 square "+" -> 76 wide "− n +", brand fill, 12 radius, 250ms.
 */
export function QuantityStepper({ quantity = 0, onAdd, onIncrement, onDecrement, disabled = false, name = "item" }) {
  if (quantity <= 0) {
    return (
      <span className="mv-qty mv-qty--idle">
        <button type="button" onClick={onAdd} disabled={disabled} aria-label={`Add ${name}`}>
          <Plus aria-hidden="true" />
        </button>
      </span>
    )
  }
  return (
    <span className="mv-qty mv-qty--active" role="group" aria-label={`${name} quantity`}>
      <button type="button" onClick={onDecrement} disabled={disabled} aria-label={`Remove one ${name}`}>
        <Minus aria-hidden="true" />
      </button>
      <output key={quantity} aria-live="polite">
        {quantity}
      </output>
      <button type="button" onClick={onIncrement} disabled={disabled} aria-label={`Add one more ${name}`}>
        <Plus aria-hidden="true" />
      </button>
    </span>
  )
}

/** FoodItemCard: 20 radius, 12 padding, 100px image at 16 radius, bold name, 2-line description, brand price. */
export function FoodItemCard({ name, description, price, image, isVeg, available = true, quantity = 0, onAdd, onIncrement, onDecrement, onOpen }) {
  return (
    <article className={cx("mv-fcard", !available && "mv-fcard--unavailable")}>
      <SmartImage src={image} alt={name} category="food" className="mv-fcard__img" />
      <div className="mv-fcard__body">
        <h3 className="mv-fcard__name" onClick={onOpen}>
          {typeof isVeg === "boolean" && <VegMark veg={isVeg} />}
          <span>{name}</span>
        </h3>
        {description && <p className="mv-fcard__desc">{description}</p>}
        <div className="mv-fcard__foot">
          <span className="mv-fcard__price">{rupees(price)}</span>
          {available ? (
            <QuantityStepper quantity={quantity} onAdd={onAdd} onIncrement={onIncrement} onDecrement={onDecrement} name={name} />
          ) : (
            <span className="mv-badge mv-badge--neutral">Unavailable</span>
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * FloatingViewCartBar: 56 tall, 24 radius, brand fill with a 40% brand glow,
 * up to three overlapping thumbnails (34px, 10px overlap) and a "+n" tile,
 * total and item count, then "View Cart". Swipe left to reveal "Remove" when
 * `onRemove` is given. Change `bumpKey` to play the add-to-cart bump.
 */
export function FloatingCartBar({ itemCount = 0, subtotal = 0, images = [], onOpen, onRemove, bumpKey, inline = false, bottomOffset = 24 }) {
  const [reveal, setReveal] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [bumping, setBumping] = useState(false)
  const drag = useRef(null)
  const firstBump = useRef(true)

  useEffect(() => {
    if (firstBump.current) {
      firstBump.current = false
      return
    }
    setBumping(true)
  }, [bumpKey])

  if (itemCount <= 0) return null

  const thumbs = images.slice(0, 3)
  const extra = itemCount - thumbs.length
  const slots = thumbs.length + (extra > 0 && thumbs.length ? 1 : 0)
  const stackWidth = slots ? 34 + (slots - 1) * 24 : 0

  const onPointerDown = (e) => {
    if (!onRemove) return
    drag.current = { x: e.clientX, start: reveal, moved: false }
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    if (Math.abs(dx) > 4) {
      drag.current.moved = true
      setDragging(true)
    }
    setReveal(Math.min(1, Math.max(0, drag.current.start - dx / 116)))
  }
  const onPointerUp = () => {
    if (!drag.current) return
    const moved = drag.current.moved
    drag.current = null
    setDragging(false)
    if (moved) setReveal((r) => (r > 0.4 ? 1 : 0))
    return moved
  }
  const onClick = () => {
    if (reveal > 0) {
      setReveal(0)
      return
    }
    onOpen?.()
  }

  return (
    <div
      className={cx("mv-cartbar", inline && "mv-cartbar--inline", bumping && "mv-cartbar--bump")}
      style={{ "--mv-cartbar-offset": `${bottomOffset}px` }}
      onAnimationEnd={() => setBumping(false)}
    >
      {onRemove && (
        <button
          type="button"
          className="mv-cartbar__remove"
          tabIndex={reveal > 0.5 ? 0 : -1}
          onClick={() => {
            setReveal(0)
            onRemove()
          }}
        >
          Remove
        </button>
      )}
      <button
        type="button"
        className="mv-cartbar__bar"
        style={{ "--mv-reveal": reveal }}
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        aria-label={`View cart, ${itemCount} item${itemCount === 1 ? "" : "s"}, ${rupees(subtotal)}`}
      >
        {slots > 0 && (
          <span className="mv-cartbar__thumbs" style={{ width: stackWidth }} aria-hidden="true">
            {thumbs.map((img, i) => (
              <span key={i} className="mv-cartbar__thumb" style={{ left: i * 24, zIndex: 3 - i }}>
                <SmartImage src={img} category="food" />
              </span>
            ))}
            {extra > 0 && (
              <span className="mv-cartbar__more" style={{ left: thumbs.length * 24 }}>
                +{extra}
              </span>
            )}
          </span>
        )}
        <span className="mv-cartbar__totals">
          <span className="mv-cartbar__amount">{rupees(subtotal)}</span>
          <span className="mv-cartbar__count">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
        </span>
        <span className="mv-cartbar__cta">
          View Cart
          <ChevronRight aria-hidden="true" />
        </span>
      </button>
    </div>
  )
}

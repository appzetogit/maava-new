import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Clock, Heart, Mic, Minus, Plus, Search, Share2, Star, UtensilsCrossed, X } from "lucide-react"
import { useProfile } from "../../context/ProfileContext"
import { useLocation as useUserLocation } from "../../hooks/useLocation"
import { useZone } from "../../hooks/useZone"
import {
  BottomSheet,
  Button,
  EmptyState,
  FloatingCartBar,
  IconButton,
  QuantityStepper,
  SkeletonBox,
  SkeletonFoodItemCard,
  SmartImage,
  toast,
  usePrefersReducedMotion,
} from "../index"
import { toCartItem } from "../data/catalog"
import { useCartActions } from "../data/useCartActions"
import { useRestaurantMenu } from "../data/useRestaurantMenu"
import { useRestaurantFavorite } from "../data/useRestaurantFavorite"
import "./restaurant.css"

/**
 * Restaurant page, rebuilt from presentation/restaurant/screens/restaurant_screen.dart.
 *
 * Brand block with back / share / favourite over an info card (Featured badge,
 * name, time and distance, green rating box, closed notice, rotating offers);
 * then a sticky search bar with voice search and category chips; All / Veg /
 * Non-Veg; each menu section as a two-column dish grid with ADD buttons that
 * grow into steppers; the floating MENU button; the cart bar.
 *
 * Kept from the current website, which the app handles elsewhere: dishes can't
 * be added while the customer is outside the delivery zone or the restaurant
 * is closed -- the order would only fail later at checkout.
 */
const OUT_OF_ZONE = "You are outside the service zone. Please select a location within the service area."
const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

function haversineKm(a, b) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function DietMark({ veg }) {
  return (
    <span className={veg ? "fr-mark" : "fr-mark fr-mark--non"} role="img" aria-label={veg ? "Veg" : "Non-veg"}>
      <i />
    </span>
  )
}

function OffersTicker({ offers }) {
  const reduce = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const pausedUntil = useRef(0)
  useEffect(() => {
    if (offers.length < 2 || reduce) return undefined
    const t = setInterval(() => {
      if (Date.now() >= pausedUntil.current) setIndex((i) => (i + 1) % offers.length)
    }, 3500)
    return () => clearInterval(t)
  }, [offers.length, reduce])
  return (
    <div className="fr-offers" onPointerDown={() => (pausedUntil.current = Date.now() + 5000)}>
      <span className="fr-offers__burst" aria-hidden="true">
        %
      </span>
      <div className="fr-offers__window" aria-live="polite">
        <div className="fr-offers__track" style={{ transform: `translateY(${-index * 24}px)` }}>
          {offers.map((offer, i) => (
            <p key={i} aria-hidden={i !== index}>
              {offer}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

export function useVoiceSearch(onResult) {
  const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null
  const [listening, setListening] = useState(false)
  const start = () => {
    if (!Recognition || listening) return
    const rec = new Recognition()
    rec.lang = "en-IN"
    rec.interimResults = false
    rec.onresult = (e) => onResult(e.results?.[0]?.[0]?.transcript || "")
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    setListening(true)
    rec.start()
  }
  return { supported: Boolean(Recognition), listening, start }
}

function AddButton({ available, quantity, customisable, onAdd, onIncrement, onDecrement, name }) {
  if (!available) return <span className="fr-add fr-add--off">Unavailable</span>
  return (
    <span className="fr-dish__add">
      {quantity > 0 ? (
        <span className="fr-add fr-add--active" role="group" aria-label={`${name} quantity`}>
          <button type="button" onClick={onDecrement} aria-label={`Remove one ${name}`}>
            <Minus aria-hidden="true" />
          </button>
          <output key={quantity} aria-live="polite">
            {quantity}
          </output>
          <button type="button" onClick={onIncrement} aria-label={`Add one more ${name}`}>
            <Plus aria-hidden="true" />
          </button>
        </span>
      ) : (
        <span className="fr-add">
          <button type="button" onClick={onAdd} aria-label={`Add ${name}`}>
            ADD
          </button>
        </span>
      )}
      {customisable && <span className="fr-dish__custom">Customisable</span>}
    </span>
  )
}

function DishCard({ dish, quantity, onAdd, onIncrement, onDecrement, onOpen }) {
  const customisable = dish.variants.length > 0
  const price = customisable ? Math.min(...dish.variants.map((v) => v.price)) : dish.price
  return (
    <article className={dish.isAvailable ? "fr-dish" : "fr-dish fr-dish--off"}>
      <div className="fr-dish__media">
        <button type="button" className="fr-dish__img" onClick={onOpen} aria-label={`About ${dish.name}`}>
          <SmartImage src={dish.image} alt="" category="food" />
        </button>
        <AddButton
          name={dish.name}
          available={dish.isAvailable}
          quantity={quantity}
          customisable={customisable}
          onAdd={onAdd}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
        />
      </div>
      <div className="fr-dish__tags">
        <DietMark veg={dish.isVeg} />
        {dish.rating > 0 && (
          <span className="fr-dish__rating">
            <Star aria-hidden="true" />
            {dish.rating.toFixed(1)}
          </span>
        )}
      </div>
      <h3 className="fr-dish__name" onClick={onOpen}>
        {dish.name}
      </h3>
      <span className="fr-dish__price">{rupees(price)}</span>
    </article>
  )
}

/** FoodDetailSheet + VariantPickerSheet: one sheet, opened to look or to choose a size. */
export function DishSheet({ dish, onClose, onConfirm }) {
  const cheapest = dish?.variants?.length ? dish.variants.reduce((a, b) => (a.price <= b.price ? a : b)) : null
  const [variantId, setVariantId] = useState(cheapest?.id || null)
  const [qty, setQty] = useState(1)
  useEffect(() => {
    setVariantId(cheapest?.id || null)
    setQty(1)
  }, [dish?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!dish) return null
  const variant = dish.variants.find((v) => v.id === variantId) || null
  const unit = variant ? variant.price : dish.price
  return (
    <BottomSheet open onClose={onClose}>
      <span className="fr-sheet-img">
        <SmartImage src={dish.image} alt={dish.name} category="food" eager />
      </span>
      <div className="fr-sheet-body">
        <h2 className="fr-sheet-title">
          <DietMark veg={dish.isVeg} />
          {dish.name}
        </h2>
        <span className="fr-sheet-price">{rupees(unit)}</span>
        {dish.description && <p className="fr-sheet-desc">{dish.description}</p>}
        {dish.variants.length > 0 && (
          <div className="fr-sizes" role="radiogroup" aria-label="Choose a size">
            <h3>
              Choose a size <span>Required</span>
            </h3>
            {dish.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={v.id === variantId}
                aria-label={`${v.name}, ${rupees(v.price)}`}
                className="fr-size"
                onClick={() => setVariantId(v.id)}
              >
                <span className="fr-size__dot" aria-hidden="true" />
                <span className="fr-size__name">{v.name}</span>
                <span className="fr-size__price">{rupees(v.price)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {dish.isAvailable ? (
        <div className="fr-sheet-foot">
          <QuantityStepper
            name={dish.name}
            quantity={qty}
            onAdd={() => setQty(1)}
            onIncrement={() => setQty((q) => Math.min(q + 1, 50))}
            onDecrement={() => setQty((q) => Math.max(q - 1, 1))}
          />
          <Button onClick={() => onConfirm(dish, variant, qty)}>Add item · {rupees(unit * qty)}</Button>
        </div>
      ) : (
        <p className="fr-sheet-desc" style={{ marginTop: 16 }}>
          This dish isn't available right now.
        </p>
      )}
    </BottomSheet>
  )
}

export default function FoodRestaurant() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const reduce = usePrefersReducedMotion()
  const menu = useRestaurantMenu(slug)
  const { restaurant, sections } = menu

  const { vegMode } = useProfile()
  const { location } = useUserLocation()
  const { isOutOfService } = useZone(location)
  const cart = useCartActions()
  const favorite = useRestaurantFavorite(restaurant, menu.raw)

  const [query, setQuery] = useState("")
  const [diet, setDiet] = useState("all") // all | veg | nonveg
  const [activeSection, setActiveSection] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetDish, setSheetDish] = useState(null)
  const voice = useVoiceSearch((text) => setQuery(text))

  // As in the app: global veg mode forces veg-only whatever the segment says.
  const effectiveDiet = vegMode ? "veg" : diet
  const visibleSections = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (d) =>
            (effectiveDiet === "all" || (effectiveDiet === "veg" ? d.isVeg : !d.isVeg)) &&
            (!q || `${d.name} ${d.description}`.toLowerCase().includes(q)),
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [sections, query, effectiveDiet])

  // Highlight the chip for the section in view.
  useEffect(() => {
    const nodes = visibleSections.map((s) => document.getElementById(`fr-sec-${s.id}`)).filter(Boolean)
    if (!nodes.length || !("IntersectionObserver" in window)) return undefined
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActiveSection(top.target.id.replace("fr-sec-", ""))
      },
      { rootMargin: "-140px 0px -55% 0px" },
    )
    nodes.forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [visibleSections])

  const scrollToSection = (id) => {
    setActiveSection(id)
    document.getElementById(`fr-sec-${id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  }

  const distanceKm = useMemo(() => {
    const loc = menu.raw?.location
    const rLat = Number(loc?.latitude ?? loc?.coordinates?.[1])
    const rLng = Number(loc?.longitude ?? loc?.coordinates?.[0])
    const uLat = Number(location?.latitude)
    const uLng = Number(location?.longitude)
    if (![rLat, rLng, uLat, uLng].every(Number.isFinite)) return null
    return haversineKm({ lat: uLat, lng: uLng }, { lat: rLat, lng: rLng })
  }, [menu.raw, location?.latitude, location?.longitude])

  const canOrder = () => {
    if (isOutOfService) {
      toast.error(OUT_OF_ZONE)
      return false
    }
    if (restaurant && !restaurant.isOpen) {
      toast.error(`${restaurant.name} isn't accepting orders right now.`)
      return false
    }
    return true
  }

  const addDish = (dish, variant = null, qty = 1) => {
    if (!canOrder()) return
    cart.add(toCartItem(dish, variant), qty)
  }

  const onAddTap = (dish) => {
    if (dish.variants.length) setSheetDish(dish)
    else addDish(dish)
  }
  const onIncrement = (dish) => {
    if (dish.variants.length) setSheetDish(dish)
    else if (canOrder()) cart.change(dish.id, cart.quantityOf(dish.id) + 1)
  }
  const onDecrement = (dish) => {
    // A sized dish can sit on several lines; take one off the most recent.
    const lines = (cart.cart || []).filter((line) => (line.foodId || line.id) === dish.id)
    const line = lines[lines.length - 1]
    if (line) cart.change(line.id, (line.quantity || 0) - 1)
  }

  const share = async () => {
    const url = window.location.href.replace(/[?&]shell=[^&]*/, "")
    const text = `Order from ${restaurant?.name} on Maava`
    try {
      if (navigator.share) await navigator.share({ title: restaurant?.name, text, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.success("Link copied")
      }
    } catch {
      /* the customer closed the share sheet */
    }
  }

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/food/user"))

  if (menu.status === "missing") {
    return (
      <div className="fr">
        <div className="fr-top">
          <div className="fr-top__bar">
            <IconButton label="Back" onClick={back}>
              <ArrowLeft />
            </IconButton>
          </div>
        </div>
        <EmptyState icon={UtensilsCrossed} title="Restaurant unavailable" subtitle="This restaurant isn't on Maava right now." />
      </div>
    )
  }

  const loading = menu.status === "loading"
  const itemCount = cart.itemCount || 0

  return (
    <div className="fr">
      <div className="fr-top">
        <div className="fr-top__bar">
          <IconButton label="Back" onClick={back}>
            <ArrowLeft />
          </IconButton>
          {restaurant && (
            <div className="fr-top__actions">
              <IconButton label={`Share ${restaurant.name}`} onClick={share}>
                <Share2 />
              </IconButton>
              <IconButton
                label={favorite.isFavorite ? `Remove ${restaurant.name} from favourites` : `Save ${restaurant.name} to favourites`}
                className="fr-fav"
                aria-pressed={favorite.isFavorite}
                onClick={favorite.toggle}
              >
                <Heart />
              </IconButton>
            </div>
          )}
        </div>

        <div className="fr-info">
          {loading || !restaurant ? (
            <div style={{ display: "grid", gap: 8 }} aria-hidden="true">
              <SkeletonBox width="60%" height={20} radius={6} />
              <SkeletonBox width="40%" height={14} radius={6} />
            </div>
          ) : (
            <>
              <div className="fr-info__row">
                <div style={{ minWidth: 0 }}>
                  {restaurant.isFeatured && (
                    <span className="fr-info__featured">
                      <Star aria-hidden="true" />
                      Featured
                    </span>
                  )}
                  <h1 className="fr-info__name">{restaurant.name}</h1>
                  <p className="fr-info__meta">
                    {[restaurant.deliveryTime, distanceKm != null && `${distanceKm.toFixed(1)} km`].filter(Boolean).join("  |  ")}
                  </p>
                </div>
                {restaurant.rating > 0 && (
                  <div className="fr-info__rating">
                    <b aria-label={`Rated ${restaurant.rating.toFixed(1)} out of 5`}>
                      {restaurant.rating.toFixed(1)}
                      <Star aria-hidden="true" />
                    </b>
                    {restaurant.reviewCount > 0 && <span>{restaurant.reviewCount} ratings</span>}
                  </div>
                )}
              </div>
              {!restaurant.isOpen && (
                <div className="fr-info__closed" role="status">
                  <Clock aria-hidden="true" />
                  <div>
                    <b>Delivery is currently unavailable.</b>
                    <span>It will accept orders once it reopens.</span>
                  </div>
                </div>
              )}
              {restaurant.offerBadges.length > 0 && (
                <>
                  <div className="fr-info__dash" aria-hidden="true" />
                  <OffersTicker offers={restaurant.offerBadges} />
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="fr-sticky">
        <div className="fr-search" role="search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search for dishes in ${restaurant?.name || "this restaurant"}`}
            aria-label="Search this menu"
          />
          {query && (
            <IconButton label="Clear search" onClick={() => setQuery("")}>
              <X />
            </IconButton>
          )}
          {voice.supported && (
            <IconButton label="Search by voice" className="fr-search__mic" aria-pressed={voice.listening} onClick={voice.start}>
              <Mic />
            </IconButton>
          )}
        </div>
        {sections.length > 1 && (
          <div className="fr-chips" role="toolbar" aria-label="Menu sections">
            {visibleSections.map((s) => (
              <button key={s.id} type="button" className="fr-chip" aria-current={s.id === activeSection} onClick={() => scrollToSection(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div role="radiogroup" aria-label="Diet" className="fr-seg">
        {[
          ["all", "All", null],
          ["veg", "Veg", <DietMark key="v" veg />],
          ["nonveg", "Non-Veg", <DietMark key="n" veg={false} />],
        ].map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={effectiveDiet === value}
            disabled={vegMode && value !== "veg"}
            title={vegMode && value !== "veg" ? "Veg mode is on" : undefined}
            onClick={() => setDiet(value)}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="fr-sections">
        {loading ? (
          <>
            <SkeletonFoodItemCard />
            <SkeletonFoodItemCard />
            <SkeletonFoodItemCard />
          </>
        ) : menu.status === "error" ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="The menu didn't load"
            subtitle="Check your connection and try again."
            action={
              <Button size="md" block={false} onClick={menu.reload}>
                Try again
              </Button>
            }
          />
        ) : visibleSections.length === 0 ? (
          <p className="fr-empty">No dishes match your filters.</p>
        ) : (
          visibleSections.map((section) => (
            <section key={section.id} id={`fr-sec-${section.id}`} className="fr-section" aria-labelledby={`fr-h-${section.id}`}>
              <div className="fr-section__head">
                <h2 id={`fr-h-${section.id}`}>{section.name}</h2>
                <span>
                  {section.items.length} item{section.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="fr-grid">
                {section.items.map((dish) => (
                  <DishCard
                    key={dish.id}
                    dish={dish}
                    quantity={cart.dishQuantity(dish.id)}
                    onAdd={() => onAddTap(dish)}
                    onIncrement={() => onIncrement(dish)}
                    onDecrement={() => onDecrement(dish)}
                    onOpen={() => setSheetDish(dish)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {visibleSections.length > 1 && (
        <button
          type="button"
          className="fr-menu-fab"
          style={{ bottom: itemCount > 0 ? 90 : 20 }}
          onClick={() => setMenuOpen(true)}
          aria-label="Menu sections"
        >
          <UtensilsCrossed aria-hidden="true" />
          <span aria-hidden="true">MENU</span>
        </button>
      )}

      <FloatingCartBar
        itemCount={itemCount}
        subtotal={cart.total || 0}
        images={(cart.cart || []).map((i) => i.image || i.imageUrl)}
        bumpKey={cart.lastAddEvent}
        onOpen={() => navigate("/food/user/cart")}
        onRemove={cart.clearCart}
      />

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu Categories">
        <div className="fr-menu-list">
          {visibleSections.map((s) => (
            <button
              key={s.id}
              type="button"
              className="fr-menu-row"
              onClick={() => {
                setMenuOpen(false)
                setTimeout(() => scrollToSection(s.id), 50)
              }}
            >
              {s.name}
              <b>{s.items.length}</b>
            </button>
          ))}
        </div>
      </BottomSheet>

      <DishSheet
        dish={sheetDish}
        onClose={() => setSheetDish(null)}
        onConfirm={(dish, variant, qty) => {
          setSheetDish(null)
          addDish(dish, variant, qty)
        }}
      />

      <BottomSheet open={Boolean(cart.pending)} onClose={cart.cancelReplace} title="Start a new cart?">
        <p className="mv-body-medium">
          Your cart has items from {cart.cartRestaurantName}. Adding {cart.pending?.name} will clear it.
        </p>
        <div className="fr-sheet-actions">
          <Button onClick={cart.confirmReplace}>Start new cart</Button>
          <Button variant="outline" onClick={cart.cancelReplace}>
            Keep current cart
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}

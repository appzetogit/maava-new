import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, Bike, ChevronRight, Clock, Mic, Plus, Search, SearchX, Star, X } from "lucide-react"
import { useProfile } from "../../context/ProfileContext"
import { useLocation as useUserLocation } from "../../hooks/useLocation"
import { useZone } from "../../hooks/useZone"
import { BottomSheet, Button, FloatingCartBar, IconButton, SkeletonList, SmartImage, toast } from "../index"
import { restaurantPath, toCartItem } from "../data/catalog"
import { useCartActions } from "../data/useCartActions"
import { useFoodSearch, useRecentSearches } from "../data/useFoodSearch"
import { DishSheet, useVoiceSearch } from "./FoodRestaurant"
import "./search.css"

/**
 * Search, rebuilt from presentation/search/screens/search_screen.dart.
 *
 * Back arrow and a pill field (clear, voice); All / Dishes / Restaurants /
 * ₹99 Store chips; before typing, recent searches and popular keywords; then
 * "Results" with restaurant cards (time, delivery fee) and dish cards with Add.
 *
 * The query lives in ?q=, which every existing search box on the site already
 * links to, so those links land here unchanged. Differences from the app, on
 * purpose: ratings and "Free Delivery" only show when the data says so (the app
 * falls back to 4.0 and to free), dishes say Veg or Non-veg (the app always
 * says Veg), and the website's delivery-zone check still guards adding.
 */
const CHIPS = [
  { id: "all", label: "All", emoji: "🍽" },
  { id: "dishes", label: "Dishes", emoji: "🍕" },
  { id: "restaurants", label: "Restaurants", emoji: "🏪" },
  { id: "store99", label: "₹99 Store", emoji: "🏷" },
]
const POPULAR = ["Burger", "Pizza", "Chicken", "Biryani", "Thali", "Paratha", "Sandwich", "Fries"]
const OUT_OF_ZONE = "You are outside the service zone. Please select a location within the service area."
const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`
const fromPrice = (dish) => (dish.variants.length ? Math.min(...dish.variants.map((v) => v.price)) : dish.price)

function Rating({ value }) {
  if (!(value > 0)) return null
  return (
    <span className="fs-card__rating" aria-label={`Rated ${value.toFixed(1)}`}>
      <Star aria-hidden="true" />
      {value.toFixed(1)}
    </span>
  )
}

function RestaurantResult({ restaurant: r, onOpen }) {
  const feeKnown = r.isFreeDelivery || r.raw?.deliveryFee != null
  const fee = r.isFreeDelivery || r.deliveryFee === 0 ? "Free Delivery" : `${rupees(r.deliveryFee)} Delivery`
  return (
    <button type="button" className="fs-card fs-card--restaurant" onClick={onOpen}>
      <span className="fs-card__img">
        <SmartImage src={r.imageUrl} alt="" category="restaurant" />
      </span>
      <span className="fs-card__body">
        <span className="fs-card__badges">
          <span className="fs-card__type">Restaurant</span>
          <Rating value={r.rating} />
        </span>
        <span className="fs-card__title">
          <span className="fs-card__name">{r.name}</span>
        </span>
        {(r.tags.length > 0 || r.deliveryTime) && <span className="fs-card__sub">{r.tags.length ? r.tags.join(", ") : r.deliveryTime}</span>}
        {(r.deliveryTime || feeKnown) && (
          <span className="fs-card__meta">
            {r.deliveryTime && (
              <span>
                <Clock aria-hidden="true" />
                {r.deliveryTime}
              </span>
            )}
            {r.deliveryTime && feeKnown && <span aria-hidden="true">•</span>}
            {feeKnown && (
              <span>
                <Bike aria-hidden="true" />
                {fee}
              </span>
            )}
          </span>
        )}
      </span>
      <ChevronRight className="fs-card__chev" aria-hidden="true" />
    </button>
  )
}

function DishResult({ dish: d, quantity, onOpen, onAdd }) {
  const sub = [d.restaurantName, d.description].filter(Boolean).join(" · ")
  return (
    <article className="fs-card">
      <button type="button" className="fs-card__img" onClick={onOpen} aria-label={`About ${d.name}`}>
        <SmartImage src={d.image} alt="" category="food" />
      </button>
      <div className="fs-card__body">
        <span className="fs-card__badges">
          <span className="fs-card__type">Dish</span>
          <Rating value={d.rating} />
        </span>
        <span className="fs-card__title">
          <button type="button" className="fs-card__name" onClick={onOpen}>
            {d.name}
          </button>
          <span className="fs-card__price">{rupees(fromPrice(d))}</span>
        </span>
        {sub && <span className="fs-card__sub">{sub}</span>}
        <span className="fs-card__foot">
          <span className={d.isVeg ? "fs-diet" : "fs-diet fs-diet--non"}>
            <i aria-hidden="true" />
            {d.isVeg ? "Veg" : "Non-veg"}
          </span>
          {d.isAvailable ? (
            <button type="button" className={quantity > 0 ? "fs-add fs-add--in" : "fs-add"} onClick={onAdd} aria-label={`Add ${d.name}`}>
              <Plus aria-hidden="true" />
              {quantity > 0 ? `${quantity} added` : "Add"}
            </button>
          ) : (
            <span className="fs-card__sub">Unavailable</span>
          )}
        </span>
      </div>
    </article>
  )
}

function Empty({ title, children, action }) {
  return (
    <div className="fs-empty" role="status">
      <span className="fs-empty__icon" aria-hidden="true">
        <SearchX />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  )
}

export default function FoodSearch() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(() => params.get("q") || "")
  const [filter, setFilter] = useState(() => (params.get("mode") === "store99" ? "store99" : "all"))
  const [sheetDish, setSheetDish] = useState(null)
  const inputRef = useRef(null)

  const { vegMode } = useProfile()
  const { location } = useUserLocation()
  const { zoneId, isOutOfService } = useZone(location)
  const recent = useRecentSearches()
  const cart = useCartActions()
  const mode = filter === "store99" ? "store99" : "home"
  const search = useFoodSearch(text, mode, { zoneId, lat: location?.latitude, lng: location?.longitude })

  const submit = (value) => {
    const clean = String(value || "").trim()
    if (!clean) return
    setText(clean)
    recent.save(clean)
  }
  const voice = useVoiceSearch(submit)

  // A query that arrives in the link counts as a search the customer made.
  useEffect(() => {
    const initial = params.get("q")
    if (initial?.trim()) recent.save(initial)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep ?q= in step with the field, so back/forward and shared links land on the same results.
  useEffect(() => {
    const clean = text.trim()
    if ((params.get("q") || "") === clean) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (clean) next.set("q", clean)
        else next.delete("q")
        return next
      },
      { replace: true },
    )
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  const { restaurants, dishes } = useMemo(() => {
    let rs = search.restaurants
    let ds = search.dishes
    if (vegMode) {
      rs = rs.filter((r) => r.isPureVeg)
      ds = ds.filter((d) => d.isVeg)
    }
    if (filter === "dishes" || filter === "store99") rs = []
    if (filter === "restaurants") ds = []
    return { restaurants: rs, dishes: ds }
  }, [search.restaurants, search.dishes, vegMode, filter])
  const count = restaurants.length + dishes.length

  const addDish = (dish, variant = null, qty = 1) => {
    if (isOutOfService) {
      toast.error(OUT_OF_ZONE)
      return
    }
    if (cart.add(toCartItem(dish, variant), qty)) toast.success(`Added "${dish.name}" to cart!`)
  }
  const onAdd = (dish) => (dish.variants.length ? setSheetDish(dish) : addDish(dish))
  const openDish = (dish) => {
    recent.save(dish.name)
    setSheetDish(dish)
  }
  const openRestaurant = (r) => {
    recent.save(r.name)
    navigate(restaurantPath(r))
  }
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/food/user"))

  const q = text.trim()
  let body
  if (!q) {
    body = (
      <div className="fs-default">
        {recent.items.length > 0 && (
          <section className="fs-group" aria-labelledby="fs-recent">
            <div className="fs-group__head">
              <h2 id="fs-recent">Recent Searches</h2>
              <button type="button" onClick={recent.clear}>
                Clear All
              </button>
            </div>
            <div className="fs-tags">
              {recent.items.map((item) => (
                <span key={item} className="fs-tag fs-tag--recent">
                  <button type="button" onClick={() => submit(item)}>
                    {item}
                  </button>
                  <button type="button" className="fs-tag__x" onClick={() => recent.remove(item)} aria-label={`Remove ${item} from recent searches`}>
                    <X aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          </section>
        )}
        <section className="fs-group" aria-labelledby="fs-popular">
          <div className="fs-group__head">
            <h2 id="fs-popular">Popular Keywords</h2>
          </div>
          <div className="fs-tags">
            {POPULAR.map((kw) => (
              <button key={kw} type="button" className="fs-tag" onClick={() => submit(kw)}>
                {kw}
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  } else if (search.status === "loading" || search.status === "idle") {
    body = (
      <div className="fs-skeletons">
        <SkeletonList count={3} label="Searching" />
      </div>
    )
  } else if (search.status === "error") {
    body = (
      <Empty
        title="Search isn't responding"
        action={
          <Button size="md" block={false} onClick={search.retry}>
            Try again
          </Button>
        }
      >
        Check your connection and try again.
      </Empty>
    )
  } else if (count === 0) {
    body = (
      <Empty title="No results found">
        We couldn't find any matches for "{q}". Try searching for another food item or restaurant.
      </Empty>
    )
  } else {
    body = (
      <div className="fs-results">
        <div className="fs-results__head" aria-live="polite">
          <h2>Results</h2>
          <p>
            Showing {count} {count === 1 ? "result" : "results"} for <b>"{q}"</b>
          </p>
        </div>
        {restaurants.map((r) => (
          <RestaurantResult key={`r-${r.id}`} restaurant={r} onOpen={() => openRestaurant(r)} />
        ))}
        {dishes.map((d) => (
          <DishResult key={`d-${d.id}`} dish={d} quantity={cart.dishQuantity(d.id)} onOpen={() => openDish(d)} onAdd={() => onAdd(d)} />
        ))}
      </div>
    )
  }

  return (
    <div className="fs">
      <header className="fs-head">
        <form
          className="fs-bar"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            submit(text)
            inputRef.current?.blur()
          }}
        >
          <IconButton label="Back" onClick={back}>
            <ArrowLeft />
          </IconButton>
          <div className="fs-field">
            <Search aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === "home" ? 'Search "Burger", "Pizza", "MAAVA"...' : "Search 99 Store deals, dishes..."}
              aria-label="Search dishes and restaurants"
            />
            {text && (
              <IconButton
                label="Clear search"
                onClick={() => {
                  setText("")
                  inputRef.current?.focus()
                }}
              >
                <X />
              </IconButton>
            )}
            {voice.supported && (
              <IconButton label="Search by voice" className="fs-mic" aria-pressed={voice.listening} onClick={voice.start}>
                <Mic />
              </IconButton>
            )}
          </div>
        </form>
        <div className="fs-chips" role="toolbar" aria-label="Show results for">
          {CHIPS.map((c) => (
            <button key={c.id} type="button" className="fs-chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
              <span aria-hidden="true">{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>
      </header>

      {body}

      <FloatingCartBar
        itemCount={cart.itemCount || 0}
        subtotal={cart.total || 0}
        images={(cart.cart || []).map((i) => i.image || i.imageUrl)}
        bumpKey={cart.lastAddEvent}
        onOpen={() => navigate("/food/user/cart")}
        onRemove={cart.clearCart}
      />

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

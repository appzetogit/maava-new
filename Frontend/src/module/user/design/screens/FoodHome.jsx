import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  Bike,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  IndianRupee,
  Leaf,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Star,
  Timer,
  UtensilsCrossed,
  Zap,
} from "lucide-react"
import { useProfile } from "../../context/ProfileContext"
import { useCart } from "../../context/CartContext"
import { useLocationSelector } from "../../components/UserLayout"
import { useLocation as useUserLocation } from "../../hooks/useLocation"
import { useZone } from "../../hooks/useZone"
import {
  AppBar,
  BottomSheet,
  Button,
  CategoryRail,
  EmptyState,
  FloatingCartBar,
  PromoCarousel,
  RestaurantCard,
  SkeletonBanner,
  SkeletonRestaurantCard,
  SmartImage,
  usePrefersReducedMotion,
} from "../index"
import { restaurantPath, toCartItem } from "../data/catalog"
import { useFoodHome } from "../data/useFoodHome"
import "./home.css"

/**
 * Food home, rebuilt from presentation/home/home_screen.dart.
 *
 * Order, as in the app: collapsing header (hero images, delivery address,
 * avatar) with the search bar, veg switch and categories pinned beneath it;
 * quick-filter pills; 99 STORE; RESTAURANTS NEAR YOU; promo carousel; 99 Store
 * carousel; POPULAR BRANDS; then every restaurant. The floating cart bar sits
 * above the tab bar whenever the cart has items.
 *
 * Deliberate difference: the app's restaurant card fetches each restaurant's
 * full menu to show dish photos -- one request per card, 50 on this page. The
 * web card uses the menu and cover photos the list already returns instead.
 */

const HEADER_RANGE = 315 - 26 - 8 // banner - overlap - collapsed top padding
const FALLBACK_HINTS = ["dishes"] // the app's own fallback when there are no categories
const listTitle = (count) => `${count} RESTAURANTS DELIVERING TO YOU`

const QUICK_PILLS = [
  {
    id: "trending",
    icon: Flame,
    title: "Trending",
    highlight: "Now",
    filter: { title: "Trending Now", empty: "No trending restaurants right now", icon: Flame, match: (r) => r.isFeatured },
  },
  { id: "store99", icon: IndianRupee, title: "99", highlight: "Store" },
  {
    id: "fast",
    icon: Zap,
    title: "Near & Fast",
    filter: { title: "Near & Fast", empty: "No nearby fast-delivery restaurants right now", icon: Zap, match: (r) => r.isNearAndFast },
  },
  {
    id: "bogo",
    icon: ShoppingBag,
    title: "Buy 1 Get 1",
    highlight: "Free",
    filter: {
      title: "Buy 1 Get 1 Free",
      empty: "No Buy 1 Get 1 Free meals available right now",
      icon: ShoppingBag,
      match: (r) => r.offerBadges.some((b) => /buy\s*1|b\s*1\s*g\s*1/i.test(b)),
    },
  },
  {
    id: "free",
    icon: Bike,
    title: "FREE",
    highlight: "Delivery",
    filter: { title: "Free Delivery", empty: "No free-delivery restaurants nearby right now", icon: Bike, match: (r) => r.deliveryFee <= 0 },
  },
  { id: "veg", icon: Leaf, title: "Pure Veg" },
]

const STORE99_PATH = "/food/user/under-250" // until Phase 5 builds the 99 Store
const rupees = (n) => `₹${Math.round(Number(n) || 0)}`

const categoryMatcher = (selected) => {
  if (!selected || selected === "All" || selected === "More") return () => true
  const query = selected.toLowerCase().trim()
  const singular = query.endsWith("s") ? query.slice(0, -1) : query
  return (text) => {
    const hay = text.toLowerCase()
    return hay.includes(query) || hay.includes(singular)
  }
}

const sameRestaurant = (a, b) => {
  const norm = (v) => String(v || "").trim().toLowerCase()
  if (norm(a.restaurant) && norm(b.restaurant)) return norm(a.restaurant) === norm(b.restaurant)
  return String(a.restaurantId || "") === String(b.restaurantId || "")
}

function useCollapseProgress(rootRef) {
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const t = Math.min(1, Math.max(0, window.scrollY / HEADER_RANGE))
      rootRef.current?.style.setProperty("--t", t.toFixed(3))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [rootRef])
}

function useRotatingIndex(length, intervalMs, enabled = true) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!enabled || length < 2) return undefined
    const t = setInterval(() => setIndex((i) => (i + 1) % length), intervalMs)
    return () => clearInterval(t)
  }, [length, intervalMs, enabled])
  return length ? index % length : 0
}

function HeaderBanner({ images, title, subtitle, avatarUrl, initial, onLocation, onProfile }) {
  const reduce = usePrefersReducedMotion()
  const active = useRotatingIndex(images.length, 4000, !reduce)
  const slides = images.length ? images : [null]
  return (
    <div className="fh-banner">
      {slides.map((src, i) => (
        <div key={i} className="fh-banner__slide" data-on={i === active ? "" : undefined} aria-hidden={i !== active}>
          <SmartImage src={src} alt="" category="food" eager={i === 0} />
        </div>
      ))}
      <div className="fh-banner__shade" />
      <div className="fh-banner__top">
        <button type="button" className="fh-loc" onClick={onLocation} aria-label={`Delivering to ${title}. Change delivery address`}>
          <span className="fh-loc__pin">
            <MapPin aria-hidden="true" />
          </span>
          <span className="fh-loc__text">
            <span className="fh-loc__title">
              <span>{title}</span>
              <ChevronDown aria-hidden="true" />
            </span>
            <span className="fh-loc__sub">
              <span>{subtitle}</span>
              <ChevronRight aria-hidden="true" />
            </span>
          </span>
        </button>
        <button type="button" className="fh-avatar" onClick={onProfile} aria-label="Your profile">
          {avatarUrl ? <SmartImage src={avatarUrl} alt="" /> : initial}
        </button>
      </div>
      {images.length > 1 && (
        <div className="fh-banner__dots" aria-hidden="true">
          {images.map((_, i) => (
            <i key={i} data-on={i === active ? "" : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}

function SearchRow({ hints, vegMode, onToggleVeg, onSearch }) {
  const reduce = usePrefersReducedMotion()
  const index = useRotatingIndex(hints.length, 3000, !reduce)
  const hint = hints[index] || "dishes"
  return (
    <div className="fh-search-row">
      <button type="button" className="fh-search" onClick={onSearch} aria-label="Search restaurants and dishes">
        <Search aria-hidden="true" />
        <span className="fh-search__hint">
          <span key={hint}>Search &ldquo;{hint}&rdquo;</span>
        </span>
      </button>
      <button type="button" role="switch" aria-checked={vegMode} className="fh-veg" onClick={onToggleVeg} aria-label="Veg mode">
        <span className="fh-veg__label">
          <i aria-hidden="true" />
          VEG
        </span>
        <span className="fh-veg__switch" aria-hidden="true">
          <i />
        </span>
      </button>
    </div>
  )
}

function SectionHead({ title, onViewAll }) {
  return (
    <div className="fh-head">
      <h2>{title}</h2>
      {onViewAll && (
        <button type="button" className="fh-viewall" onClick={onViewAll}>
          View All
          <ChevronRight aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function MiniQty({ quantity, onAdd, onIncrement, onDecrement, name }) {
  if (quantity <= 0) {
    return (
      <span className="fh-miniqty">
        <button type="button" onClick={onAdd} aria-label={`Add ${name}`}>
          <Plus aria-hidden="true" />
        </button>
      </span>
    )
  }
  return (
    <span className="fh-miniqty fh-miniqty--active" role="group" aria-label={`${name} quantity`}>
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
  )
}

function Store99Section({ foods, status, quantityOf, onAdd, onChange, onOpenFood, onViewAll }) {
  if (status === "loading") return <SkeletonBanner height={140} />
  if (!foods.length) return null
  return (
    <section className="fh-section" aria-label="99 Store">
      <div className="fh-99head">
        <span className="fh-99badge" aria-hidden="true">
          99
        </span>
        <div>
          <h2 className="fh-99title">99 STORE</h2>
          <p className="fh-99sub">
            <CheckCircle2 aria-hidden="true" />
            Meals at ₹99 + Free Delivery
          </p>
        </div>
        <button type="button" className="fh-viewall" onClick={onViewAll}>
          View All
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="fh-99grid">
        {foods.map((food) => {
          const qty = quantityOf(food.id)
          return (
            <article key={food.id} className="fh-99card">
              <span onClick={() => onOpenFood(food)}>
                <SmartImage src={food.image} alt={food.name} category="food" className="fh-99card__img" />
              </span>
              {food.rating > 0 && (
                <span className="fh-99card__rating">
                  <Star aria-hidden="true" />
                  {food.rating.toFixed(1)}
                </span>
              )}
              <span className="fh-99card__add">
                <MiniQty
                  name={food.name}
                  quantity={qty}
                  onAdd={() => onAdd(food)}
                  onIncrement={() => onChange(food, qty + 1)}
                  onDecrement={() => onChange(food, qty - 1)}
                />
              </span>
              <div className="fh-99card__body">
                <h3 className="fh-99card__name">{food.name}</h3>
                <div className="fh-99card__meta">
                  <span className="fh-99card__price">{rupees(food.price)}</span>
                  {food.prepTime && (
                    <span className="fh-99card__time">
                      <Timer aria-hidden="true" />
                      {/\d$/.test(food.prepTime) ? `${food.prepTime} min` : food.prepTime}
                    </span>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function NearYou({ restaurants, onOpen }) {
  return (
    <div className="fh-scroll fh-near">
      {restaurants.map((r) => {
        const info = [
          r.priceForOne > 0 && `${rupees(r.priceForOne)} for one`,
          r.isFreeDelivery || r.deliveryFee === 0 ? "Free Delivery" : r.deliveryFee > 0 ? `${rupees(r.deliveryFee)} Delivery` : null,
          r.tags[0],
        ]
          .filter(Boolean)
          .join(" • ")
        return (
          <button key={r.id} type="button" className="fh-near__card" onClick={() => onOpen(r)}>
            <span className="fh-near__media">
              <SmartImage src={r.imageUrl} alt="" />
              {r.deliveryTime && <span className="fh-near__time">{r.deliveryTime}</span>}
              <span className="fh-near__logo">
                <SmartImage src={r.imageUrl} alt="" />
              </span>
            </span>
            <span className="fh-near__row">
              <span className="fh-near__name">{r.name}</span>
              {r.rating > 0 && (
                <span className="fh-near__rating">
                  <Star aria-hidden="true" />
                  {r.rating.toFixed(1)}
                </span>
              )}
            </span>
            {info && <span className="fh-near__info">{info}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** PopularBrandsList: drifts 0.8px every 32ms, pauses while touched, resumes 2s later. */
function PopularBrands({ restaurants, onOpen }) {
  const rowRef = useRef(null)
  const pausedUntil = useRef(0)
  const reduce = usePrefersReducedMotion()

  useEffect(() => {
    if (reduce || restaurants.length < 2) return undefined
    const tick = setInterval(() => {
      const row = rowRef.current
      if (!row || Date.now() < pausedUntil.current) return
      const max = row.scrollWidth - row.clientWidth
      if (max <= 0) return
      row.scrollLeft = row.scrollLeft + 0.8 >= max ? 0 : row.scrollLeft + 0.8
    }, 32)
    return () => clearInterval(tick)
  }, [reduce, restaurants.length])

  const pause = () => {
    pausedUntil.current = Date.now() + 2000
  }

  return (
    <div
      ref={rowRef}
      className="fh-scroll fh-brands"
      onPointerDown={pause}
      onPointerMove={pause}
      onWheel={pause}
      onFocus={pause}
      onMouseEnter={() => {
        pausedUntil.current = Number.MAX_SAFE_INTEGER
      }}
      onMouseLeave={pause}
    >
      {restaurants.map((r) => (
        <button key={r.id} type="button" className="fh-brand" onClick={() => onOpen(r)}>
          <span className="fh-brand__logo">
            <SmartImage src={r.imageUrl} alt="" />
          </span>
          <span className="fh-brand__name">{r.name}</span>
          {r.deliveryTime && <span className="fh-brand__time">{r.deliveryTime}</span>}
        </button>
      ))}
    </div>
  )
}

function RestaurantList({ restaurants, onOpen }) {
  return (
    <div className="fh-list">
      {restaurants.map((r, i) => (
        <RestaurantCard
          key={r.id}
          index={i}
          name={r.name}
          images={[...r.menuImages, ...r.coverImages, r.imageUrl].filter(Boolean).slice(0, 5)}
          rating={r.rating}
          deliveryTime={r.deliveryTime}
          priceForOne={r.priceForOne}
          offer={r.offerBadges[0]}
          cuisines={r.tags.slice(0, 3)}
          isPureVeg={r.isPureVeg}
          mustTry={r.featuredDishName ? { name: r.featuredDishName, price: r.priceForOne } : null}
          isOpen={r.isOpen}
          onOpen={() => onOpen(r)}
        />
      ))}
    </div>
  )
}

function FilterResults({ pill, restaurants, loading, onBack, onOpen }) {
  const { title, empty, icon } = pill.filter
  const matches = restaurants.filter(pill.filter.match)
  return (
    <div className="fh-filter">
      <AppBar title={title} onBack={onBack} />
      {loading ? (
        <div className="fh-list">
          <SkeletonRestaurantCard />
          <SkeletonRestaurantCard />
        </div>
      ) : matches.length ? (
        <RestaurantList restaurants={matches} onOpen={onOpen} />
      ) : (
        <EmptyState icon={icon || UtensilsCrossed} title={title} subtitle={empty} />
      )}
    </div>
  )
}

export default function FoodHome() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const rootRef = useRef(null)
  useCollapseProgress(rootRef)

  const { vegMode, setVegMode, getDefaultAddress, userProfile } = useProfile()
  const { cart, itemCount = 0, total = 0, lastAddEvent, addToCart, updateQuantity, removeFromCart, getCartItem, clearCart } = useCart()
  const { openLocationSelector } = useLocationSelector()
  const { location, loading: locating } = useUserLocation()

  const lat = Number(location?.latitude)
  const lng = Number(location?.longitude)
  // Scope the page to the customer's delivery zone, as the classic home does.
  // With no location yet there is no zone to wait for.
  const { zoneId, zoneStatus, isOutOfService } = useZone(location)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  // Wait for the zone once we know where the customer is -- but never for
  // more than 4s, so a failed lookup can't leave the page empty.
  const [zoneWaitOver, setZoneWaitOver] = useState(false)
  useEffect(() => {
    if ((!hasCoords && !locating) || zoneId) return undefined
    const t = setTimeout(() => setZoneWaitOver(true), 4000)
    return () => clearTimeout(t)
  }, [hasCoords, locating, zoneId])
  const zoneReady = (!hasCoords && !locating) || Boolean(zoneId) || zoneStatus === "OUT_OF_SERVICE" || zoneWaitOver
  const home = useFoodHome({ lat, lng, zoneId: isOutOfService ? null : zoneId, zoneReady })

  const [category, setCategory] = useState("All")
  const [pendingFood, setPendingFood] = useState(null)

  // ---- header content ----
  const saved = getDefaultAddress?.()
  const placeTitle = saved?.label || location?.area || location?.city || "Set location"
  const placeLine = location?.formattedAddress && location.formattedAddress !== "Select location"
    ? location.formattedAddress
    : saved?.formattedAddress || saved?.address || "Tap to add a delivery address"
  const avatarUrl = userProfile?.profileImage?.url || userProfile?.profileImage || userProfile?.avatar || ""
  const initial = String(userProfile?.name || userProfile?.phone || "U").replace(/^\+?91/, "").trim().charAt(0).toUpperCase() || "U"
  const hints = home.categories.data.length ? home.categories.data.map((c) => c.name).slice(0, 12) : FALLBACK_HINTS

  // ---- filtering, as _filterRestaurants / _filterFoods do ----
  const matchCategory = useMemo(() => categoryMatcher(category), [category])
  const vegRestaurantIds = useMemo(
    () => new Set(home.foods.data.filter((f) => f.isVeg).map((f) => f.restaurantId)),
    [home.foods.data],
  )
  const restaurants = useMemo(
    () =>
      home.restaurants.data.filter(
        (r) => (!vegMode || r.isPureVeg || vegRestaurantIds.has(r.id)) && matchCategory(`${r.name} ${r.tags.join(" ")}`),
      ),
    [home.restaurants.data, vegMode, vegRestaurantIds, matchCategory],
  )
  const store99Foods = useMemo(
    () =>
      home.foods.data.filter(
        (f) => f.price <= 99 && (!vegMode || f.isVeg) && matchCategory(`${f.name} ${f.description}`),
      ),
    [home.foods.data, vegMode, matchCategory],
  )
  const nearYou = vegMode ? restaurants.filter((r) => r.isPureVeg) : restaurants

  // ---- cart ----
  const quantityOf = useCallback((id) => getCartItem?.(id)?.quantity || 0, [getCartItem])
  const addFood = (food) => {
    const item = toCartItem(food)
    const first = cart?.[0]
    const isMart = (x) => x?.restaurantId === "hibermart-id" || String(x?.restaurant || "").toLowerCase() === "hibermart"
    // The cart refuses a second restaurant by throwing inside a state update,
    // where no caller can catch it -- so check first, as the restaurant page does.
    if (first && !isMart(first) && !sameRestaurant(first, item)) {
      setPendingFood(food)
      return
    }
    addToCart(item)
  }
  const changeQty = (food, next) => {
    if (next <= 0) removeFromCart(food.id)
    else updateQuantity(food.id, next)
  }
  const replaceCart = () => {
    const food = pendingFood
    setPendingFood(null)
    if (!food) return
    clearCart()
    addToCart(toCartItem(food))
  }

  const openRestaurant = (r) => navigate(restaurantPath(r))
  const openFood = (food) => navigate(restaurantPath({ slug: "", id: food.restaurantId }))
  const toSearch = () => navigate("/food/user/search")

  const onPill = (pill) => {
    if (pill.id === "store99") return navigate(STORE99_PATH)
    if (pill.id === "veg") return setVegMode(true)
    setParams({ filter: pill.id })
  }
  const activePill = QUICK_PILLS.find((p) => p.id === params.get("filter") && p.filter)

  const cartBar = (
    <FloatingCartBar
      itemCount={itemCount}
      subtotal={total}
      images={(cart || []).map((i) => i.image || i.imageUrl)}
      bumpKey={lastAddEvent}
      bottomOffset={96}
      onOpen={() => navigate("/food/user/cart")}
      onRemove={clearCart}
    />
  )

  if (activePill) {
    return (
      <>
        <FilterResults
          pill={activePill}
          restaurants={home.restaurants.data}
          loading={home.restaurants.status === "loading"}
          onBack={() => navigate(-1)}
          onOpen={openRestaurant}
        />
        {cartBar}
      </>
    )
  }

  const loadingRestaurants = home.restaurants.status === "loading"

  return (
    <div ref={rootRef} className="fh">
      <HeaderBanner
        images={home.heroBanners.data}
        title={placeTitle}
        subtitle={placeLine}
        avatarUrl={avatarUrl}
        initial={initial}
        onLocation={openLocationSelector}
        onProfile={() => navigate("/food/user/profile")}
      />

      <div className="fh-sticky">
        <SearchRow hints={hints} vegMode={Boolean(vegMode)} onToggleVeg={() => setVegMode(!vegMode)} onSearch={toSearch} />
        <CategoryRail categories={home.categories.data} selected={category} onSelect={setCategory} />
      </div>

      <div className="fh-body">
        <div className="fh-scroll fh-pills" role="toolbar" aria-label="Quick filters">
          {QUICK_PILLS.map((pill) => {
            const Icon = pill.icon
            return (
              <button
                key={pill.id}
                type="button"
                className="fh-pill"
                aria-pressed={pill.id === "veg" ? Boolean(vegMode) : undefined}
                onClick={() => onPill(pill)}
              >
                <Icon aria-hidden="true" />
                <b>{pill.title}</b>
                {pill.highlight && <span>{pill.highlight}</span>}
              </button>
            )
          })}
        </div>

        {isOutOfService && (
          <div className="fh-zone" role="status">
            <b>We don&apos;t deliver to this location yet</b>
            <span>You can browse, but orders need an address inside a Maava delivery area.</span>
            <Button size="md" block={false} onClick={openLocationSelector}>
              Change location
            </Button>
          </div>
        )}
        <Store99Section
          foods={store99Foods}
          status={home.foods.status}
          quantityOf={quantityOf}
          onAdd={addFood}
          onChange={changeQty}
          onOpenFood={openFood}
          onViewAll={() => navigate(STORE99_PATH)}
        />

        <section className="fh-section" aria-label="Restaurants near you">
          <SectionHead title="RESTAURANTS NEAR YOU" onViewAll={toSearch} />
          {loadingRestaurants ? <SkeletonBanner height={180} /> : nearYou.length > 0 && <NearYou restaurants={nearYou} onOpen={openRestaurant} />}
        </section>

        {home.promoBanners.data.length > 0 && (
          <PromoCarousel
            label="Offers"
            banners={home.promoBanners.data}
            onSelect={(b) => {
              const linked = b.linkedRestaurants?.[0]
              const id = typeof linked === "string" ? linked : linked?._id || linked?.id
              if (id) navigate(`/food/user/restaurants/${encodeURIComponent(id)}`)
            }}
          />
        )}

        {home.store99Banners.data.length > 0 && (
          <PromoCarousel label="99 Store offers" banners={home.store99Banners.data} onSelect={() => navigate(STORE99_PATH)} />
        )}

        <section className="fh-section" aria-label="Popular brands">
          <SectionHead title="POPULAR BRANDS" onViewAll={toSearch} />
          {loadingRestaurants ? <SkeletonBanner height={80} /> : <PopularBrands restaurants={restaurants} onOpen={openRestaurant} />}
        </section>

        {loadingRestaurants ? (
          <div className="fh-list" role="status" aria-label="Loading restaurants">
            <SkeletonRestaurantCard />
            <SkeletonRestaurantCard />
            <SkeletonRestaurantCard />
          </div>
        ) : home.restaurants.status === "error" ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="Restaurants didn't load"
            subtitle="Check your connection and try again."
            action={
              <Button size="md" block={false} onClick={home.reload}>
                Try again
              </Button>
            }
          />
        ) : (
          restaurants.length > 0 && (
            <section className="fh-section" aria-label="All restaurants">
              <SectionHead title={isOutOfService ? `${restaurants.length} RESTAURANTS ON MAAVA` : listTitle(restaurants.length)} />
              <RestaurantList restaurants={restaurants} onOpen={openRestaurant} />
            </section>
          )
        )}
      </div>

      {cartBar}

      <BottomSheet
        open={Boolean(pendingFood)}
        onClose={() => setPendingFood(null)}
        title="Start a new cart?"
      >
        <p className="mv-body-medium">
          Your cart has items from {cart?.[0]?.restaurant || "another restaurant"}. Adding {pendingFood?.name} from{" "}
          {pendingFood?.restaurantName || "this restaurant"} will clear it.
        </p>
        <div className="fh-sheet-actions">
          <Button onClick={replaceCart}>Start new cart</Button>
          <Button variant="outline" onClick={() => setPendingFood(null)}>
            Keep current cart
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}

import { useEffect, useState } from "react"
import { Bell, CreditCard, Heart, HelpCircle, MapPin, Phone, ReceiptText, ShoppingCart, Wallet } from "lucide-react"
import {
  AppBar,
  Badge,
  BottomNav,
  BottomSheet,
  BrandProvider,
  Button,
  CategoryRail,
  Chip,
  EmptyState,
  FloatingCartBar,
  FoodItemCard,
  IconButton,
  ListGroup,
  ListRow,
  ModeSwitchButton,
  PalettePicker,
  PromoCarousel,
  RatingPill,
  RestaurantCard,
  SearchBar,
  SectionHeader,
  SegmentedControl,
  SkeletonBanner,
  SkeletonFoodItemCard,
  SkeletonOrderCard,
  SkeletonRestaurantCard,
  TextField,
  toast,
  typeRoles,
  useBrand,
  VegMark,
} from "./index"
import "./kit.css"

/**
 * /food/user/design-kit -- the Phase 1 review surface.
 *
 * Every component in the kit, in both modules and all three appearance modes,
 * so the client can compare it against the app before any screen is rebuilt.
 * Not linked from the site. Sample content uses real maava.in names and
 * images where they exist and is labelled as sample data.
 */

const SAMPLE_IMAGES = {
  profile: "/uploads/food/restaurants/profile/1787669297705-468cba35f414ad26.webp",
  menu: "/uploads/food/restaurants/menu/1787669297413-4576e319a4f6b24e.webp",
}

const CATEGORIES = ["South Indian", "North Indian", "Chinese", "Biryani", "Desserts", "Snacks", "Italian"].map((name) => ({ id: name, name }))

const BANNERS = [
  { id: "b1", imageUrl: SAMPLE_IMAGES.menu, alt: "Sample offer banner" },
  { id: "b2", imageUrl: SAMPLE_IMAGES.profile, alt: "Sample offer banner" },
  { id: "b3", imageUrl: null, alt: "Offer banner without an image" },
]

const MENU = [
  { id: "onion-dosa", name: "Onion Dosa", price: 64, isVeg: true, description: "Sample description: crisp rice crêpe with spiced onions, served with chutney and sambar." },
  { id: "masala-dosa", name: "Masala Dosa", price: 56, isVeg: true, description: "Sample description: potato masala folded into a golden dosa." },
  { id: "idli", name: "Idli", price: 56, isVeg: true },
  { id: "poori", name: "Poori", price: 56, isVeg: true, available: false },
]

const SWATCHES = [
  ["Brand", "--mv-brand"],
  ["Brand button", "--mv-brand-button"],
  ["Brand light", "--mv-brand-light"],
  ["Brand deep", "--mv-brand-deep"],
  ["Brand tint", "--mv-brand-tint"],
  ["Brand tint strong", "--mv-brand-tint-strong"],
  ["Brand soft", "--mv-brand-soft"],
  ["On brand", "--mv-on-brand"],
  ["Background", "--mv-bg"],
  ["Surface", "--mv-surface"],
  ["Card", "--mv-card"],
  ["Text", "--mv-text"],
  ["Text secondary", "--mv-text-2"],
  ["Border", "--mv-border"],
  ["Success", "--mv-success"],
  ["Danger", "--mv-danger"],
]

const toKebab = (s) => s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()

function Section({ eyebrow, title, note, children }) {
  return (
    <section className="mv-kit__section">
      <header>
        <span className="mv-kit__eyebrow">{eyebrow}</span>
        <h2 className="mv-display-small">{title}</h2>
        {note && <p className="mv-kit__note">{note}</p>}
      </header>
      {children}
    </section>
  )
}

function Swatches() {
  const { rootRef, mode, paletteId, isDark, martSeed } = useBrand()
  const [values, setValues] = useState({})
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const cs = getComputedStyle(el)
    setValues(Object.fromEntries(SWATCHES.map(([, v]) => [v, cs.getPropertyValue(v).trim()])))
  }, [rootRef, mode, paletteId, isDark, martSeed])
  return (
    <div className="mv-kit__swatches">
      {SWATCHES.map(([label, v]) => (
        <div key={v} className="mv-kit__swatch">
          <span style={{ background: `var(${v})` }} />
          <div>
            <b>{label}</b>
            <code>
              {v} {values[v] ? `· ${values[v]}` : ""}
            </code>
          </div>
        </div>
      ))}
    </div>
  )
}

function KitBody({ mode, setMode }) {
  const { themeMode, setThemeMode, martSeed } = useBrand()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All")
  const [chips, setChips] = useState({ veg: true, rating: false, fast: false })
  const [favourite, setFavourite] = useState(false)
  const [qty, setQty] = useState({ "onion-dosa": 2, "masala-dosa": 1 })
  const [bump, setBump] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [navFood, setNavFood] = useState("home")
  const [navMart, setNavMart] = useState("home")

  const change = (id, delta) => {
    setQty((q) => {
      const next = Math.max(0, (q[id] || 0) + delta)
      return { ...q, [id]: next }
    })
    if (delta > 0) setBump((b) => b + 1)
  }
  const cartItems = MENU.filter((m) => qty[m.id] > 0)
  const itemCount = cartItems.reduce((n, m) => n + qty[m.id], 0)
  const subtotal = cartItems.reduce((n, m) => n + qty[m.id] * m.price, 0)

  return (
    <div className="mv-kit">
      <div className="mv-kit__top">
        <div className="mv-kit__top-inner">
          <div className="mv-kit__brand">
            <span className="mv-kit__eyebrow">Phase 1 · design system</span>
            <h1 className="mv-headline-medium">Maava design kit</h1>
          </div>
          <div className="mv-kit__controls">
            <SegmentedControl
              label="Module"
              value={mode}
              onChange={setMode}
              options={[
                { value: "food", label: "Food" },
                { value: "mart", label: "Mart" },
              ]}
            />
            <SegmentedControl
              label="Appearance"
              value={themeMode}
              onChange={setThemeMode}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
            />
          </div>
        </div>
      </div>

      <main className="mv-kit__main">
        <Section
          eyebrow="Tokens"
          title="Colour"
          note={
            mode === "mart"
              ? `Mart is painted in the operator's colour from Admin → Power Scanning → Mart Module (currently ${martSeed}). Every shade below is derived from it with the app's own HSL rule.`
              : "Food is painted in the customer's App Theme pick. Every shade below is derived from it with the app's own HSL rule — pick a theme to watch them all move."
          }
        >
          {mode === "food" && (
            <div className="mv-kit__panel">
              <h3>App theme</h3>
              <PalettePicker />
            </div>
          )}
          <Swatches />
        </Section>

        <Section eyebrow="Tokens" title="Type" note="Poppins across every role, with the sizes, weights, line heights and tracking from the app's text theme.">
          <div className="mv-kit__type">
            {Object.entries(typeRoles).map(([role, t]) => (
              <div key={role} className="mv-kit__type-row">
                <code>
                  mv-{toKebab(role)} · {t.size}/{t.weight}
                </code>
                <p className={`mv-${toKebab(role)}`}>Onion Dosa · ₹64 · 25–30 mins</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Components" title="Buttons and inputs">
          <div className="mv-kit__grid">
            <div className="mv-kit__panel">
              <h3>Buttons</h3>
              <Button onClick={() => toast.success("Order placed")}>Place order</Button>
              <Button variant="pill">Continue</Button>
              <Button variant="outline">Add address</Button>
              <Button variant="soft">Apply coupon</Button>
              <Button
                loading={loading}
                onClick={() => {
                  setLoading(true)
                  setTimeout(() => setLoading(false), 1500)
                }}
              >
                Pay ₹240
              </Button>
              <div className="mv-kit__row">
                <Button size="md" block={false}>
                  Medium
                </Button>
                <Button size="sm" block={false} variant="outline">
                  Small
                </Button>
                <Button size="sm" block={false} variant="ghost">
                  Ghost
                </Button>
                <Button size="sm" block={false} disabled>
                  Disabled
                </Button>
              </div>
              <div className="mv-kit__row">
                <IconButton label="Notifications">
                  <Bell />
                </IconButton>
                <IconButton label="Favourites" variant="surface">
                  <Heart />
                </IconButton>
                <IconButton label="Cart" variant="brand">
                  <ShoppingCart />
                </IconButton>
              </div>
            </div>
            <div className="mv-kit__panel">
              <h3>Inputs</h3>
              <SearchBar value={query} onChange={setQuery} onSubmit={(q) => toast.info(`Searching for “${q || "dosa"}”`)} onVoice={() => toast.info("Voice search")} />
              <TextField label="Phone number" placeholder="98765 43210" inputMode="numeric" leading={<Phone />} hint="We'll send a 6-digit code" />
              <TextField variant="outlined" label="Flat / house no." placeholder="Flat 4B, Sai Residency" />
              <TextField variant="outlined" label="PIN code" defaultValue="5091" error="PIN code must be 6 digits" />
            </div>
          </div>
        </Section>

        <Section eyebrow="Components" title="Chips, badges and marks">
          <div className="mv-kit__panel">
            <div className="mv-kit__row">
              <Chip selected={chips.veg} onClick={() => setChips((c) => ({ ...c, veg: !c.veg }))}>
                Pure Veg
              </Chip>
              <Chip selected={chips.rating} onClick={() => setChips((c) => ({ ...c, rating: !c.rating }))}>
                Rating 4.0+
              </Chip>
              <Chip selected={chips.fast} onClick={() => setChips((c) => ({ ...c, fast: !c.fast }))}>
                Under 30 mins
              </Chip>
            </div>
            <div className="mv-kit__row">
              <Badge>20% OFF up to ₹50</Badge>
              <Badge tone="solid">New</Badge>
              <Badge tone="success">Free delivery</Badge>
              <Badge tone="warning">Few left</Badge>
              <Badge tone="danger">Unavailable Delivery</Badge>
              <Badge tone="neutral">Unavailable</Badge>
              <Badge tone="free">FREE</Badge>
              <RatingPill value={4.8} />
              <VegMark veg />
              <VegMark veg={false} />
            </div>
          </div>
        </Section>

        <Section eyebrow="Home" title="Categories and offers" note="Sample data. Banner images are real maava.in uploads; the third banner has no image to show the placeholder.">
          <div className="mv-kit__phone mv-kit__frame" style={{ paddingBlock: 12 }}>
            <CategoryRail categories={CATEGORIES} selected={category} onSelect={setCategory} />
            <PromoCarousel banners={BANNERS} onSelect={(b, i) => toast.info(`Offer ${i + 1}`)} />
          </div>
        </Section>

        <Section
          eyebrow="Home"
          title="Restaurant cards"
          note="Sample data from maava.in. nikitha is currently not accepting orders, so it renders the app's closed state: greyscale and not tappable."
        >
          <div className="mv-kit__grid">
            <RestaurantCard
              index={0}
              name="RAMESH TIFFIN CENTER"
              rating={4.8}
              deliveryTime="25–30 mins"
              priceForOne={120}
              offer="20% OFF up to ₹50"
              cuisines={["South Indian", "Tiffins"]}
              isPureVeg
              mustTry={{ name: "Onion Dosa", price: 64 }}
              images={[SAMPLE_IMAGES.menu, null]}
              isFavorite={favourite}
              onToggleFavorite={() => setFavourite((f) => !f)}
              onOpen={() => toast.info("Open RAMESH TIFFIN CENTER")}
            />
            <RestaurantCard
              index={1}
              name="nikitha"
              rating={5}
              deliveryTime="20 mins"
              cuisines={["South Indian", "North Indian", "Chinese", "Italian"]}
              images={[SAMPLE_IMAGES.profile, SAMPLE_IMAGES.menu]}
              isOpen={false}
            />
          </div>
        </Section>

        <Section eyebrow="Restaurant" title="Menu items and the cart bar" note="Add and remove items: the button grows into a stepper and the cart bar bumps on every add. Swipe the bar left to reveal Remove.">
          <div className="mv-kit__phone">
            {MENU.map((m) => (
              <FoodItemCard
                key={m.id}
                name={m.name}
                price={m.price}
                description={m.description}
                isVeg={m.isVeg}
                available={m.available !== false}
                quantity={qty[m.id] || 0}
                onAdd={() => change(m.id, 1)}
                onIncrement={() => change(m.id, 1)}
                onDecrement={() => change(m.id, -1)}
              />
            ))}
            <FloatingCartBar
              inline
              itemCount={itemCount}
              subtotal={subtotal}
              images={cartItems.map(() => null)}
              bumpKey={bump}
              onOpen={() => toast.info("Open cart")}
              onRemove={() => setQty({})}
            />
            {itemCount === 0 && (
              <EmptyState
                icon={ShoppingCart}
                title="Your cart is empty"
                subtitle="Add something from the menu to get started."
                action={
                  <Button size="md" block={false} onClick={() => setQty({ "onion-dosa": 1 })}>
                    Browse menu
                  </Button>
                }
              />
            )}
          </div>
        </Section>

        <Section eyebrow="Chrome" title="App bar, navigation and sheets">
          <div className="mv-kit__grid">
            <div className="mv-kit__phone mv-kit__frame">
              <AppBar
                title="RAMESH TIFFIN CENTER"
                onBack={() => toast.info("Back")}
                actions={
                  <IconButton label="Search menu">
                    <MapPin />
                  </IconButton>
                }
              />
              <div style={{ padding: "8px 16px 16px", display: "grid", gap: 12 }}>
                <SectionHeader title="Recommended for you" onAction={() => toast.info("See all")} />
                <Button variant="outline" onClick={() => setSheetOpen(true)}>
                  Open a bottom sheet
                </Button>
                <div className="mv-kit__row">
                  <Button size="sm" block={false} variant="soft" onClick={() => toast.success("Added to cart")}>
                    Success toast
                  </Button>
                  <Button size="sm" block={false} variant="soft" onClick={() => toast.error("Payment failed. Try another method.")}>
                    Error toast
                  </Button>
                  <Button size="sm" block={false} variant="soft" onClick={() => toast.warning("Restaurant closes in 15 mins")}>
                    Warning toast
                  </Button>
                </div>
              </div>
              <BottomNav variant="food" activeId={navFood} onSelect={setNavFood} center={<ModeSwitchButton destination="mart" onSwitch={() => setMode("mart")} />} />
            </div>
            <div className="mv-kit__phone mv-kit__frame">
              <div style={{ padding: 16, display: "grid", gap: 8 }}>
                <span className="mv-kit__eyebrow">Mart tab bar</span>
                <p className="mv-kit__note">The raised disc in the middle of each bar is the Food/Mart switch, as in the app: it shows where it takes you and always wears the Food theme colour. Tap it here to flip the whole kit.</p>
              </div>
              <BottomNav variant="mart" activeId={navMart} onSelect={setNavMart} badges={{ cart: 3 }} center={<ModeSwitchButton destination="food" diameter={52} onSwitch={() => setMode("food")} />} />
            </div>
          </div>
          <BottomSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="Masala Dosa"
            footer={
              <Button
                onClick={() => {
                  setSheetOpen(false)
                  change("masala-dosa", 1)
                  toast.success("Masala Dosa added")
                }}
              >
                Add item · ₹56
              </Button>
            }
          >
            <p className="mv-body-medium">Choose how you'd like it. Sample content for the sheet layout.</p>
            <div className="mv-kit__row" style={{ marginTop: 12 }}>
              <Chip selected>Regular</Chip>
              <Chip>Ghee roast (+₹20)</Chip>
            </div>
          </BottomSheet>
        </Section>

        <Section eyebrow="Profile" title="Menu rows">
          <div className="mv-kit__phone">
            <ListGroup>
              <ListRow icon={<ReceiptText />} title="Your orders" subtitle="Track, reorder and get help" />
              <ListRow icon={<Heart />} title="Favourites" />
              <ListRow icon={<Wallet />} title="Wallet" end="₹120" />
              <ListRow icon={<MapPin />} title="Saved addresses" />
              <ListRow icon={<CreditCard />} title="Payment methods" />
              <ListRow icon={<HelpCircle />} title="Help & support" />
            </ListGroup>
          </div>
        </Section>

        <Section eyebrow="Loading" title="Skeletons">
          <div className="mv-kit__grid">
            <div className="mv-kit__phone">
              <SkeletonBanner />
              <SkeletonRestaurantCard />
            </div>
            <div className="mv-kit__phone">
              <SkeletonFoodItemCard />
              <SkeletonOrderCard />
            </div>
          </div>
        </Section>
      </main>
    </div>
  )
}

export default function DesignKit() {
  const [mode, setMode] = useState("food")
  return (
    <BrandProvider mode={mode}>
      <KitBody mode={mode} setMode={setMode} />
    </BrandProvider>
  )
}

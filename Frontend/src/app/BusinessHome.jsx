import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  ShoppingBag,
  Store,
  Bike,
  UtensilsCrossed,
  MessageCircle,
  ShieldCheck,
  MapPin,
  Mail,
  Phone,
  Clock,
  Wallet,
  RotateCcw,
  ChevronDown,
  ArrowRight,
} from "lucide-react"
import apiClient from "../services/api"
import fallbackLogo from "../assets/appzetologo.png"

/**
 * maava.in's public home page: who runs Maava, what it does, how it talks to
 * customers, and how to reach the business.
 *
 * It exists for reviewers as much as shoppers -- WhatsApp Business API, payment
 * gateways and app stores all check that the domain describes a real business
 * with a name, address and contact details that match its registration. Those
 * details are read live from Admin -> Business Setup, so correcting the legal
 * name or address there fixes this page with no redeploy. Nothing here is
 * invented: no reviews, no client logos, no figures.
 */

const STORE_LINKS = {
  customerAndroid: "https://play.google.com/store/apps/details?id=com.maava.user",
  customerIos: "https://apps.apple.com/in/app/maava/id6762790109",
  partnerAndroid: "https://play.google.com/store/apps/details?id=com.maava.restaurant",
  partnerIos: "https://apps.apple.com/in/app/maava-restaurant/id6762795938",
  riderAndroid: "https://play.google.com/store/apps/details?id=com.maava.delivery",
  riderIos: "https://apps.apple.com/in/app/maava-delivery/id6763990935",
}

const SERVICES = [
  {
    Icon: UtensilsCrossed,
    title: "Food delivery",
    body: "Order from local restaurants and get your meal delivered to your door, with live tracking from the kitchen to your doorstep.",
  },
  {
    Icon: ShoppingBag,
    title: "Maava Mart",
    body: "Groceries, vegetables and daily essentials from nearby stores, delivered quickly. Each store's opening hours and delivery time are shown before you order.",
  },
  {
    Icon: Store,
    title: "For restaurants and sellers",
    body: "List your menu or products, accept orders on the Maava Partner app, and get paid for every order with a clear commission on each one.",
  },
  {
    Icon: Bike,
    title: "For delivery partners",
    body: "Deliver with Maava on your own schedule. Every trip shows what you earn, paid per kilometre, and every tip goes to you in full.",
  },
]

const STEPS = [
  { title: "Choose", body: "Pick a restaurant or store that delivers to your address and add items to your cart." },
  { title: "Pay", body: "Pay online by UPI, card or net banking through Razorpay, from your Maava wallet, or in cash on delivery." },
  { title: "Track", body: "The restaurant accepts and prepares your order, a delivery partner picks it up, and you follow it live." },
  { title: "Receive", body: "Your order arrives. Share the delivery code with your delivery partner and rate your experience." },
]

const WHY = [
  { Icon: MapPin, text: "Local restaurants and stores from your own town" },
  { Icon: Clock, text: "Live order tracking and delivery time shown upfront" },
  { Icon: Wallet, text: "UPI, cards, wallet and cash on delivery" },
  { Icon: RotateCcw, text: "Refunds back to your original payment method, tracked in the app" },
  { Icon: ShieldCheck, text: "Secure sign-in with a one-time password, payments by Razorpay" },
  { Icon: MessageCircle, text: "Help from our own support team through the app, email or phone" },
]

const MESSAGES = [
  { title: "Sign-in codes", body: "One-time passwords when you log in to the Maava app." },
  { title: "Order updates", body: "Confirmation, preparation, pickup and delivery status for orders you place." },
  { title: "Payments and refunds", body: "Receipts and the progress of any refund to your account." },
  { title: "Customer support", body: "Replies to questions you send us about an order or your account." },
]

const FAQ = [
  {
    q: "Where does Maava deliver?",
    a: "Maava delivers in Jadcherla (Telangana), with Maava Mart also in Indore and Bhopal (Madhya Pradesh). Enter your address in the app to see the restaurants and stores that deliver to you.",
  },
  {
    q: "How can I pay?",
    a: "By UPI, debit or credit card and net banking (processed securely by Razorpay), from your Maava wallet, or in cash when your order arrives, where the restaurant or store offers it.",
  },
  {
    q: "Can I cancel an order?",
    a: "Yes, from the order screen in the app, shortly after placing it and before your food is packed. If you paid online, the full amount is refunded automatically.",
  },
  {
    q: "How long does a refund take?",
    a: "Refunds to your Maava wallet are instant. Refunds to UPI usually arrive within 2-3 working days, and to cards or net banking within 5-7 working days. The order screen shows each step and the bank reference.",
  },
  {
    q: "How do I list my restaurant or store?",
    a: "Download the Maava Partner app, register with your business details and documents, and our team will review and approve your listing.",
  },
  {
    q: "What messages will Maava send me?",
    a: "Only messages about your account and the orders you place: sign-in codes, order and delivery updates, payment and refund updates, and replies to your support requests. You can ask us to stop non-essential messages at any time.",
  },
]

const formatPhone = (phone) => {
  if (!phone) return ""
  if (typeof phone === "string") return phone
  const code = String(phone.countryCode || "").trim()
  const number = String(phone.number || "").trim()
  return [code, number].filter(Boolean).join(" ")
}

const titleCase = (value) =>
  String(value || "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())

function useBusinessDetails() {
  const [details, setDetails] = useState(null)
  useEffect(() => {
    let cancelled = false
    apiClient
      .get("/food/admin/business-settings/public")
      .then((res) => {
        if (!cancelled) setDetails(res?.data?.data || null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return details
}

function StoreButtons({ android, ios, tone = "light" }) {
  const base =
    tone === "light"
      ? "bg-white text-violet-900 hover:bg-violet-50"
      : "bg-violet-900 text-white hover:bg-violet-800"
  return (
    <div className="flex flex-wrap gap-3">
      <a href={android} target="_blank" rel="noopener noreferrer" className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${base}`}>
        Get it on Google Play
      </a>
      <a href={ios} target="_blank" rel="noopener noreferrer" className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${base}`}>
        Download on the App Store
      </a>
    </div>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
      >
        <span className="text-base font-semibold text-slate-900">{q}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-violet-700 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="pb-5 pr-8 text-[15px] leading-relaxed text-slate-600">{a}</p>}
    </div>
  )
}

export default function BusinessHome() {
  const details = useBusinessDetails()

  const brand = "Maava"
  const legalName = String(details?.companyName || "").trim() || brand
  const email = String(details?.email || "").trim()
  const phone = formatPhone(details?.phone)
  const phoneHref = phone.replace(/[^\d+]/g, "")
  const addressLine = [
    titleCase(details?.address),
    titleCase(details?.city),
    titleCase(details?.state),
    String(details?.pincode || "").trim(),
    details?.region === "India" || !details?.region ? "India" : details.region,
  ]
    .filter(Boolean)
    .join(", ")
  const logo = details?.logo?.url || fallbackLogo
  const year = new Date().getFullYear()

  useEffect(() => {
    document.title = "Maava | Food and grocery delivery in Jadcherla"
  }, [])

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-violet-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <img src={logo} alt="Maava" className="h-9 w-9 rounded-lg object-contain" />
            <span className="text-lg font-extrabold tracking-tight text-violet-900">Maava</span>
          </a>
          <nav aria-label="Main" className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#services" className="hover:text-violet-800">Services</a>
            <a href="#how" className="hover:text-violet-800">How it works</a>
            <a href="#messaging" className="hover:text-violet-800">Messaging</a>
            <a href="#faq" className="hover:text-violet-800">FAQ</a>
            <a href="#contact" className="hover:text-violet-800">Contact</a>
          </nav>
          <Link
            to="/food/user/"
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            Order now <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="bg-gradient-to-b from-violet-800 to-violet-700 text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.3fr_1fr] md:px-6 md:py-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">Food · Groceries · Local delivery</p>
              <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl [text-wrap:balance]">
                Your town's restaurants and stores, delivered to your door
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-violet-100">
                Maava is a local delivery platform from Jadcherla, Telangana. We connect customers with nearby
                restaurants and grocery stores, and with delivery partners who bring every order home.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/food/user/"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-base font-bold text-violet-950 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Order on the web <ArrowRight className="h-5 w-5" />
                </Link>
                <StoreButtons android={STORE_LINKS.customerAndroid} ios={STORE_LINKS.customerIos} />
              </div>
            </div>
            <div className="self-start rounded-2xl bg-white/10 p-6 ring-1 ring-white/15">
              <p className="text-sm font-semibold uppercase tracking-wider text-violet-200">The business</p>
              <dl className="mt-4 space-y-4 text-[15px]">
                <div>
                  <dt className="text-violet-200">Operated by</dt>
                  <dd className="font-semibold">{legalName}</dd>
                </div>
                {addressLine && (
                  <div>
                    <dt className="text-violet-200">Address</dt>
                    <dd className="font-semibold">{addressLine}</dd>
                  </div>
                )}
                {email && (
                  <div>
                    <dt className="text-violet-200">Email</dt>
                    <dd><a href={`mailto:${email}`} className="font-semibold underline-offset-4 hover:underline">{email}</a></dd>
                  </div>
                )}
                {phone && (
                  <div>
                    <dt className="text-violet-200">Phone</dt>
                    <dd><a href={`tel:${phoneHref}`} className="font-semibold underline-offset-4 hover:underline tabular-nums">{phone}</a></dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-20 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">What we do</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight [text-wrap:balance]">Services we offer</h2>
            <p className="mt-3 max-w-2xl text-slate-600">
              One platform for the people who order, the businesses who cook and sell, and the partners who deliver.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {SERVICES.map(({ Icon, title, body }) => (
                <article key={title} className="rounded-2xl border border-slate-200 p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 bg-violet-50/60">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">How it works</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">From your cart to your door</h2>
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ title, body }, i) => (
                <li key={title} className="rounded-2xl bg-white p-6 ring-1 ring-violet-100">
                  <span className="text-sm font-bold text-violet-700 tabular-nums">Step {i + 1}</span>
                  <h3 className="mt-2 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Why Maava */}
        <section className="bg-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:px-6 md:py-20">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Why Maava</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight [text-wrap:balance]">Built for the town we serve</h2>
              <p className="mt-3 text-slate-600">
                Maava started in Jadcherla to give local restaurants and shops the same reach as big cities, and to
                give customers one dependable way to order from them.
              </p>
            </div>
            <ul className="grid gap-4">
              {WHY.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
                  <span className="text-[15px] text-slate-700">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Messaging */}
        <section id="messaging" className="scroll-mt-20 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Customer communication</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight [text-wrap:balance]">How Maava messages you</h2>
            <p className="mt-3 max-w-3xl text-slate-600">
              We contact customers by SMS, push notification and WhatsApp only about their own account and the orders
              they place on Maava. We send these messages to the mobile number you register with, and you can ask us
              to stop non-essential messages at any time by writing to us{email ? ` at ${email}` : ""}.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {MESSAGES.map(({ title, body }) => (
                <div key={title} className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                  <h3 className="mt-3 font-bold">{title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Partner apps */}
        <section className="bg-white">
          <div className="mx-auto grid max-w-6xl gap-5 px-4 py-16 md:grid-cols-2 md:px-6">
            <div className="rounded-2xl bg-violet-900 p-8 text-white">
              <Store className="h-6 w-6 text-amber-300" />
              <h2 className="mt-4 text-2xl font-extrabold">Run a restaurant or store?</h2>
              <p className="mt-2 text-violet-100">Reach customers across town with the Maava Partner app.</p>
              <div className="mt-6"><StoreButtons android={STORE_LINKS.partnerAndroid} ios={STORE_LINKS.partnerIos} /></div>
            </div>
            <div className="rounded-2xl bg-amber-50 p-8 ring-1 ring-amber-100">
              <Bike className="h-6 w-6 text-violet-800" />
              <h2 className="mt-4 text-2xl font-extrabold text-violet-950">Deliver with Maava</h2>
              <p className="mt-2 text-slate-700">Earn on every trip with the Maava Delivery app.</p>
              <div className="mt-6"><StoreButtons android={STORE_LINKS.riderAndroid} ios={STORE_LINKS.riderIos} tone="dark" /></div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">FAQ</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Frequently asked questions</h2>
            <div className="mt-8 border-t border-slate-200">
              {FAQ.map((item) => <FaqItem key={item.q} {...item} />)}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-20 bg-violet-50/60">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Contact us</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">We're here to help</h2>
            <p className="mt-3 max-w-2xl text-slate-600">
              For orders, payments, refunds, your account or partnering with Maava, reach us any of these ways.
              In the app, go to Profile → Help &amp; Support.
            </p>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {email && (
                <a href={`mailto:${email}`} className="rounded-2xl bg-white p-6 ring-1 ring-violet-100 hover:ring-violet-300">
                  <Mail className="h-5 w-5 text-violet-700" />
                  <p className="mt-3 text-sm text-slate-500">Email</p>
                  <p className="mt-1 break-all font-semibold">{email}</p>
                </a>
              )}
              {phone && (
                <a href={`tel:${phoneHref}`} className="rounded-2xl bg-white p-6 ring-1 ring-violet-100 hover:ring-violet-300">
                  <Phone className="h-5 w-5 text-violet-700" />
                  <p className="mt-3 text-sm text-slate-500">Phone</p>
                  <p className="mt-1 font-semibold tabular-nums">{phone}</p>
                </a>
              )}
              {addressLine && (
                <div className="rounded-2xl bg-white p-6 ring-1 ring-violet-100">
                  <MapPin className="h-5 w-5 text-violet-700" />
                  <p className="mt-3 text-sm text-slate-500">Registered address</p>
                  <p className="mt-1 font-semibold">{legalName}</p>
                  <p className="mt-0.5 text-slate-700">{addressLine}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-violet-950 text-violet-100">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr] md:px-6">
          <div>
            <div className="flex items-center gap-2.5">
              <img src={logo} alt="" className="h-8 w-8 rounded-lg bg-white object-contain p-0.5" />
              <span className="text-lg font-extrabold text-white">Maava</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-violet-200">
              Food and grocery delivery from local restaurants and stores. Operated by {legalName}
              {addressLine ? `, ${addressLine}` : ""}.
            </p>
          </div>
          <nav aria-label="Company">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Company</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link to="/pages/about" className="hover:text-white">About us</Link></li>
              <li><Link to="/pages/contact" className="hover:text-white">Contact us</Link></li>
              <li><Link to="/food/user/" className="hover:text-white">Order food</Link></li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Legal</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link to="/pages/privacy" className="hover:text-white">Privacy policy</Link></li>
              <li><Link to="/pages/terms" className="hover:text-white">Terms of service</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-violet-300 md:px-6">
            © {year} {legalName}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

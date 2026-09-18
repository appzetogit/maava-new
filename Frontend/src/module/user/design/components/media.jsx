import { useCallback, useEffect, useRef, useState } from "react"
import { LayoutGrid, Grid2x2, Store, UtensilsCrossed } from "lucide-react"
import { cx } from "./primitives"

/**
 * The API hands images over as a string, or as { url } / { secure_url }
 * (profileImage, menuImages). Anything that reads a src goes through this --
 * treating an object as a string is what crashed the old restaurant page.
 */
export function resolveImageSrc(src) {
  if (typeof src === "string") return src.trim()
  if (src && typeof src === "object") return String(src.url || src.secure_url || src.src || "").trim()
  return ""
}

export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    if (!mq) return undefined
    const onChange = (e) => setReduce(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return reduce
}

/**
 * SmartImage: grey block while loading, fade in over 200ms, and a brand-tinted
 * placeholder with a food or store glyph when there is no image or it fails.
 */
export function SmartImage({ src, alt = "", category = "restaurant", width, height, fit = "cover", eager = false, className, style }) {
  const url = resolveImageSrc(src)
  // Status belongs to one url. The old version reset to "loading" in an effect
  // after mount, so an image that finished loading first (from cache) was
  // marked loading again and stayed invisible: "images sometimes don't render".
  const [state, setState] = useState(() => ({ url, status: url ? "loading" : "error" }))
  if (state.url !== url) setState({ url, status: url ? "loading" : "error" })
  const status = state.url === url ? state.status : url ? "loading" : "error"

  // An image can finish before React attaches onLoad; check it when it mounts.
  const imgRef = useCallback(
    (img) => {
      if (img?.complete) setState((s) => (s.url === url ? { url, status: img.naturalWidth > 0 ? "ready" : "error" } : s))
    },
    [url],
  )

  const box = { width, height, ...style }
  if (status === "error") {
    const Glyph = category === "food" ? UtensilsCrossed : Store
    return (
      <span className={cx("mv-img mv-img--placeholder", className)} style={box} role={alt ? "img" : undefined} aria-label={alt || undefined}>
        <Glyph aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className={cx("mv-img", status === "loading" && "mv-img--loading", className)} style={box}>
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        style={{ objectFit: fit }}
        onLoad={() => setState({ url, status: "ready" })}
        onError={() => setState({ url, status: "error" })}
      />
    </span>
  )
}

/**
 * PromoBannerCarousel: 150 tall, 90% viewport so neighbours peek, 16 radius,
 * rotates every 4s, pill dots (18 active / 6 idle). Pauses while hovered or
 * focused, and does not auto-rotate for reduced-motion users.
 */
export function PromoCarousel({ banners = [], height = 150, interval = 4000, onSelect, label = "Offers" }) {
  const trackRef = useRef(null)
  const activeRef = useRef(0)
  const pausedRef = useRef(false)
  const [active, setActive] = useState(0)
  const reduce = usePrefersReducedMotion()

  const goTo = useCallback(
    (index) => {
      const track = trackRef.current
      const slide = track?.children[index]
      if (!track || !slide) return
      track.scrollTo({
        left: slide.offsetLeft - track.offsetLeft - (track.clientWidth - slide.clientWidth) / 2,
        behavior: reduce ? "auto" : "smooth",
      })
    },
    [reduce],
  )

  useEffect(() => {
    const track = trackRef.current
    if (!track) return undefined
    const onScroll = () => {
      const first = track.children[0]
      if (!first) return
      const step = first.getBoundingClientRect().width + 12
      const index = Math.max(0, Math.min(banners.length - 1, Math.round(track.scrollLeft / step)))
      activeRef.current = index
      setActive(index)
    }
    track.addEventListener("scroll", onScroll, { passive: true })
    return () => track.removeEventListener("scroll", onScroll)
  }, [banners.length])

  useEffect(() => {
    if (banners.length < 2 || reduce) return undefined
    const timer = setInterval(() => {
      if (!pausedRef.current) goTo((activeRef.current + 1) % banners.length)
    }, interval)
    return () => clearInterval(timer)
  }, [banners.length, interval, reduce, goTo])

  if (!banners.length) return null
  const pause = () => {
    pausedRef.current = true
  }
  const resume = () => {
    pausedRef.current = false
  }

  return (
    <section className="mv-promo" aria-roledescription="carousel" aria-label={label} onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume}>
      <div ref={trackRef} className="mv-promo__track">
        {banners.map((banner, i) => (
          <button
            key={banner.id ?? i}
            type="button"
            className="mv-promo__slide"
            style={{ height }}
            aria-label={banner.alt || `Offer ${i + 1} of ${banners.length}`}
            onClick={() => onSelect?.(banner, i)}
          >
            <SmartImage src={banner.imageUrl} alt="" eager={i === 0} />
          </button>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="mv-promo__dots">
          {banners.map((banner, i) => (
            <button
              key={banner.id ?? i}
              type="button"
              className="mv-promo__dot"
              aria-label={`Show offer ${i + 1}`}
              aria-current={i === active}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * CategoryList: "All", the categories (de-duplicated by id and name, as the app
 * does), then "More". 54 circles, a 2.5 brand ring plus a 30% inner ring when
 * selected, 11.5 labels.
 */
export function CategoryRail({ categories = [], selected = "All", onSelect, showAll = true, showMore = true }) {
  const seenIds = new Set()
  const seenNames = new Set()
  const unique = []
  for (const c of categories) {
    const id = String(c.id ?? "").trim()
    const name = String(c.name ?? "").trim()
    const nameKey = name.toLowerCase()
    if ((id && seenIds.has(id)) || (nameKey && seenNames.has(nameKey))) continue
    if (id) seenIds.add(id)
    if (nameKey) seenNames.add(nameKey)
    unique.push({ ...c, name })
  }
  const items = [
    ...(showAll ? [{ name: "All", icon: LayoutGrid }] : []),
    ...unique,
    ...(showMore ? [{ name: "More", icon: Grid2x2 }] : []),
  ]
  const current = String(selected || "All").toLowerCase()

  return (
    <div className="mv-cats" role="toolbar" aria-label="Categories">
      {items.map((cat, i) => {
        const isSelected = cat.name.toLowerCase() === current
        const Icon = cat.icon
        return (
          <button key={`${cat.id ?? cat.name}-${i}`} type="button" className="mv-cat" aria-pressed={isSelected} onClick={() => onSelect?.(cat.name)}>
            <span className="mv-cat__ring">
              <span className="mv-cat__inner">
                <span className="mv-cat__img">
                  {Icon ? <Icon aria-hidden="true" /> : <SmartImage src={cat.imageUrl} category="food" />}
                </span>
              </span>
            </span>
            <span className="mv-cat__label">{cat.name}</span>
          </button>
        )
      })}
    </div>
  )
}

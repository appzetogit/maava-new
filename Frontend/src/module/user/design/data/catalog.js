import { resolveImageSrc } from "../components/media"

/**
 * Restaurants and foods, shaped the way the app models them
 * (data/models/restaurant_model.dart, data/models/food_model.dart).
 *
 * Every screen on the design system reads these records rather than the raw
 * API, so a field the backend names two ways (restaurantName / name,
 * estimatedDeliveryTime / estimatedDeliveryTimeMinutes) is resolved once, in
 * the same order of preference the app uses. The quick-filter pills on Home
 * depend on that: they match on isFeatured, isNearAndFast, offerBadges and
 * deliveryFee exactly as the app derives them.
 */

const str = (v) => (v == null ? "" : String(v).trim())
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const images = (list) => (Array.isArray(list) ? list : []).map(resolveImageSrc).filter(Boolean)

export const slugify = (name) =>
  str(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const offerText = (o) => (typeof o === "string" ? str(o) : str(o?.title || o?.name || o?.label || o?.discountText || o?.description))

export function mapRestaurant(json = {}) {
  const profile = resolveImageSrc(json.profileImage)
  const covers = images(json.coverImages)
  const menus = images(json.menuImages)

  const offers = []
  if (json.offer) offers.push(offerText(json.offer))
  for (const o of json.offers || []) offers.push(offerText(o))
  if (typeof json.discountText === "string" && json.discountText) offers.push(json.discountText)
  for (const o of json.activeOffers || []) offers.push(offerText(o))

  const category = str(json.category).toLowerCase()
  const isPureVeg =
    json.pureVegRestaurant === true ||
    json.isVeg === true ||
    json.isPureVeg === true ||
    json.pureVeg === true ||
    json.veg === true ||
    json.isVegOnly === true ||
    category.includes("veg") ||
    str(json.foodType).toLowerCase() === "veg"

  const deliveryFee = num(json.deliveryFee) ?? 0
  const minutes = num(json.estimatedDeliveryTimeMinutes)
  // Some restaurants store just "20"; say what it means.
  const time = str(json.estimatedDeliveryTime ?? json.deliveryTime)
  const name = str(json.restaurantName ?? json.name)
  const id = str(json._id ?? json.id ?? json.restaurantId)

  return {
    id,
    name,
    slug: str(json.slug) || slugify(name),
    imageUrl: profile || covers[0] || menus[0] || "",
    coverImages: covers,
    menuImages: menus,
    rating: num(json.rating) ?? 0,
    reviewCount: num(json.totalRatings) ?? num(json.reviewCount) ?? 0,
    deliveryTime: /^\d+$/.test(time) ? `${time} mins` : time || (minutes ? `${minutes} mins` : ""),
    deliveryFee,
    isFreeDelivery: json.isFreeDelivery === true || json.freeDelivery === true || (json.deliveryFee != null && deliveryFee === 0),
    tags: (Array.isArray(json.cuisines) ? json.cuisines : Array.isArray(json.tags) ? json.tags : []).filter((t) => typeof t === "string"),
    isFeatured: json.isFeatured === true,
    isNearAndFast: json.isNearAndFast === true,
    distanceKm: num(json.distanceInKm) ?? (num(json.distanceMeters) ?? 0) / 1000,
    priceForOne: num(json.featuredPrice) ?? num(json.priceForOne) ?? num(json.startingPrice) ?? num(json.minOrder) ?? 0,
    featuredDishName: str(json.featuredDish) || null,
    offerBadges: [...new Set(offers.filter(Boolean))],
    isOpen: json.isAcceptingOrders ?? json.isOpen ?? true,
    isPureVeg,
    raw: json,
  }
}

export function mapFood(json = {}, restaurant = {}) {
  const price = num(json.price) ?? 0
  const compareAt = num(json.otherPrice)
  return {
    id: str(json._id ?? json.id),
    restaurantId: str(json.restaurantId ?? restaurant.id),
    restaurantName: str(json.restaurantName ?? restaurant.name),
    name: str(json.name),
    description: str(json.description),
    price,
    originalPrice: compareAt && compareAt > price ? compareAt : null,
    image: resolveImageSrc(json.image) || images(json.images)[0] || "",
    rating: num(json.rating) ?? 0,
    reviewCount: num(json.totalRatings) ?? 0,
    prepTime: str(json.preparationTime ?? json.prepTime ?? json.deliveryTime),
    isVeg: str(json.foodType).toLowerCase() === "veg",
    isAvailable: json.isAvailable !== false,
    isPopular: json.isRecommended === true,
    categoryName: str(json.categoryName ?? json.category),
    // Sizes (FoodVariant in the app). Only a handful of dishes have them today.
    variants: (Array.isArray(json.variants) && json.variants.length ? json.variants : Array.isArray(json.variations) ? json.variations : [])
      .map((v) => ({ id: str(v?._id ?? v?.id), name: str(v?.name), price: num(v?.price) ?? 0 }))
      .filter((v) => v.id && v.name),
    raw: json,
  }
}

/**
 * The exact shape the current restaurant page adds to the cart, so both paths
 * meet in one cart. A chosen size becomes its own line -- 1kg and 2kg of the
 * same cake are different lines -- and carries variantId/variantName/variantPrice
 * for the order, which the backend prices from the size itself. `foodId` is the
 * dish the order line refers to; `id` is only the cart line's key.
 */
export const toCartItem = (food, variant = null) => ({
  id: variant ? `${food.id}__${variant.id}` : food.id,
  foodId: food.id,
  name: variant ? `${food.name} (${variant.name})` : food.name,
  price: variant ? variant.price : food.price,
  image: food.image,
  restaurant: food.restaurantName,
  restaurantId: food.restaurantId,
  description: food.description,
  originalPrice: variant ? null : food.originalPrice,
  isVeg: food.isVeg,
  ...(variant ? { variantId: variant.id, variantName: variant.name, variantPrice: variant.price } : {}),
})

export const restaurantPath = (restaurant) =>
  `/food/user/restaurants/${encodeURIComponent(restaurant.slug || restaurant.id)}`

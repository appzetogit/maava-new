import { useCallback } from "react"
import { useProfile } from "../../context/ProfileContext"
import { toast } from "../components/toast"

/**
 * The heart on the restaurant page. Saved restaurants live in the same
 * collection the current website uses (keyed by slug, same record shape), so a
 * restaurant saved on either page shows as saved on the other and in Profile.
 */
export function useRestaurantFavorite(restaurant, raw) {
  const { isFavorite, addFavorite, removeFavorite } = useProfile()
  const slug = restaurant?.slug || ""
  const saved = Boolean(slug) && isFavorite(slug)

  const toggle = useCallback(() => {
    if (!slug) return
    if (saved) {
      removeFavorite(slug)
      toast.success("Removed from your collection")
      return
    }
    addFavorite({
      slug,
      name: restaurant.name,
      cuisine: restaurant.tags.join(", ") || raw?.cuisine || "",
      rating: restaurant.rating,
      deliveryTime: restaurant.deliveryTime,
      distance: raw?.distance || "",
      priceRange: raw?.priceRange || "",
      image: restaurant.imageUrl,
    })
    toast.success("Saved to your collection")
  }, [slug, saved, restaurant, raw, addFavorite, removeFavorite])

  return { isFavorite: saved, toggle }
}

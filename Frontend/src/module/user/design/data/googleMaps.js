import { Loader } from "@googlemaps/js-api-loader"
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey"

/**
 * Google Maps JS, loaded once for every screen that needs it.
 *
 * The key comes from Admin -> Settings -> Business Setup, so rotating it takes
 * effect without a rebuild; the build-time key is only a fallback. One load per
 * session across every screen also keeps the Dynamic Maps bill down, which is
 * charged per map load. Extra libraries (places, geocoding) are pulled in with
 * google.maps.importLibrary when a screen needs them, so the loader options
 * never change between screens.
 */
let googlePromise = null

export function loadGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve(window.google)
  if (!googlePromise) {
    googlePromise = getGoogleMapsApiKey()
      .then((key) => {
        if (!key) throw new Error("Google Maps key unavailable")
        return new Loader({ apiKey: key, version: "weekly" }).load()
      })
      .catch((err) => {
        googlePromise = null
        throw err
      })
  }
  return googlePromise
}

/** The app's muted-grey map style (core/utils/map_styles.dart). */
export const MUTED_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#e5e5e5" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
]

/** Geocoder result -> the address fields the backend stores. */
export function addressFromGeocode(result) {
  const parts = {}
  for (const c of result?.address_components || []) for (const t of c.types || []) parts[t] = parts[t] || c.long_name
  const street = [parts.street_number, parts.route, parts.sublocality_level_2, parts.sublocality_level_1 || parts.sublocality || parts.neighborhood]
    .filter(Boolean)
    .join(", ")
  return {
    street: street || (result?.formatted_address || "").split(",").slice(0, 2).join(",").trim(),
    city: parts.locality || parts.administrative_area_level_3 || parts.administrative_area_level_2 || "",
    state: parts.administrative_area_level_1 || "",
    zipCode: parts.postal_code || "",
    formatted: result?.formatted_address || "",
  }
}

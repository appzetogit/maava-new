import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Briefcase, Crosshair, Home, Loader2, MapPin, Search, X } from "lucide-react"
import { useProfile } from "../../context/ProfileContext"
import { Button, IconButton, toast } from "../index"
import { addressFromGeocode, loadGoogleMaps, MUTED_STYLE } from "../data/googleMaps"
import { addressIdOf, coordsOf, useStoredAddressId } from "../data/useCheckout"
import "./addresses.css"

/**
 * Add or edit a delivery address, rebuilt from the app's address form
 * (quick/ui/screens/location/address_selection/address_selection_screen.dart).
 *
 * A map with a fixed centre pin (move the map, not the pin); a place search;
 * "Use current location"; then the label (Home / Office / Other) and the
 * fields. Moving the map fills city, state and pincode when they're empty.
 * The backend needs a pinned location and keeps one address per label, so the
 * form says so when a label is already taken.
 *
 * Replaces the current site's overlay, whose address lookup calls endpoints
 * that don't exist or are blocked in browsers, so its Confirm never enabled.
 */
const LABELS = [
  ["Home", Home],
  ["Office", Briefcase],
  ["Other", MapPin],
]
const FALLBACK_CENTER = { lat: 16.7716777, lng: 78.138293 } // Jadcherla, where Maava delivers today

function validate(f) {
  const e = {}
  if (!f.additionalDetails.trim()) e.additionalDetails = "House / flat number is required"
  if (!f.street.trim()) e.street = "Street / area is required"
  if (!f.city.trim()) e.city = "City is required"
  if (!f.state.trim()) e.state = "State is required"
  if (f.zipCode && !/^\d{6}$/.test(f.zipCode)) e.zipCode = "Enter a valid 6-digit pincode"
  if (f.phone && !/^\d{10}$/.test(f.phone)) e.phone = "Enter a valid 10-digit mobile number"
  if (!f.pin) e.pin = "Pin the location on the map"
  return e
}

export default function FoodAddressForm() {
  const { addressId } = useParams()
  const navigate = useNavigate()
  const { addresses = [], userProfile, addAddress, updateAddress } = useProfile()
  const [, setSelectedId] = useStoredAddressId()
  const editing = useMemo(() => (addressId ? addresses.find((a) => addressIdOf(a) === addressId) : null), [addresses, addressId])

  const [form, setForm] = useState(() => ({
    label: "Home",
    additionalDetails: "",
    street: "",
    city: "",
    state: "",
    zipCode: "",
    phone: String(userProfile?.phone || "").replace(/\D/g, "").slice(-10),
    pin: null,
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [lookup, setLookup] = useState({ status: "idle", text: "" })
  const [locating, setLocating] = useState(false)
  const loadedFor = useRef(null)

  // Fill the form once when the address being edited arrives.
  useEffect(() => {
    if (!editing || loadedFor.current === addressId) return
    loadedFor.current = addressId
    setForm({
      label: ["Home", "Office", "Other"].includes(editing.label) ? editing.label : "Other",
      additionalDetails: editing.additionalDetails || "",
      street: editing.street || "",
      city: editing.city || "",
      state: editing.state || "",
      zipCode: editing.zipCode || "",
      phone: editing.phone || "",
      pin: coordsOf(editing),
    })
  }, [editing, addressId])

  const set = (key) => (e) => {
    const value = key === "zipCode" || key === "phone" ? e.target.value.replace(/\D/g, "").slice(0, key === "zipCode" ? 6 : 10) : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((er) => ({ ...er, [key]: undefined }))
  }

  const taken = !editing || editing.label !== form.label ? addresses.find((a) => a.label === form.label && addressIdOf(a) !== addressId) : null

  /* ---------------------------------------------------------------- map */
  const mapEl = useRef(null)
  const g = useRef({})
  const [mapState, setMapState] = useState("loading") // loading | ready | off
  const [dragging, setDragging] = useState(false)
  const formRef = useRef(form)
  formRef.current = form

  const reverseGeocode = async (pos, { overwrite = false } = {}) => {
    const { geocoder } = g.current
    if (!geocoder) return
    setLookup({ status: "loading", text: "" })
    try {
      const { results } = await geocoder.geocode({ location: pos })
      const found = addressFromGeocode(results?.[0])
      setLookup({ status: "ready", text: found.formatted })
      setForm((f) => ({
        ...f,
        street: overwrite || !f.street ? found.street || f.street : f.street,
        city: overwrite || !f.city ? found.city || f.city : f.city,
        state: overwrite || !f.state ? found.state || f.state : f.state,
        zipCode: overwrite || !f.zipCode ? found.zipCode || f.zipCode : f.zipCode,
      }))
    } catch {
      setLookup({ status: "failed", text: "" })
    }
  }

  useEffect(() => {
    let alive = true
    loadGoogleMaps()
      .then(async (google) => {
        if (!alive || !mapEl.current) return
        const { Geocoder } = await google.maps.importLibrary("geocoding")
        const map = new google.maps.Map(mapEl.current, {
          center: formRef.current.pin || FALLBACK_CENTER,
          zoom: 16.5,
          styles: MUTED_STYLE,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        })
        g.current = { google, map, geocoder: new Geocoder() }
        map.addListener("dragstart", () => setDragging(true))
        map.addListener("idle", () => {
          setDragging(false)
          const c = map.getCenter()?.toJSON()
          if (!c) return
          const prev = formRef.current.pin
          // ~15 m: closer than that is the same doorstep, and each lookup is
          // a billed Geocoding request.
          if (prev && Math.abs(prev.lat - c.lat) < 0.00015 && Math.abs(prev.lng - c.lng) < 0.00015) return
          setForm((f) => ({ ...f, pin: c }))
          setErrors((er) => ({ ...er, pin: undefined }))
          clearTimeout(g.current.geoTimer)
          g.current.geoTimer = setTimeout(() => reverseGeocode(c), 700)
        })
        setMapState("ready")
      })
      .catch(() => alive && setMapState("off"))
    return () => {
      alive = false
      clearTimeout(g.current.geoTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When the edited address loads after the map, move the map to it.
  useEffect(() => {
    if (mapState === "ready" && editing && form.pin) g.current.map.setCenter(form.pin)
  }, [mapState, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Your browser can't share your location. Search for the address or move the map.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude }
        setForm((f) => ({ ...f, pin: pos }))
        setErrors((er) => ({ ...er, pin: undefined }))
        if (g.current.map) g.current.map.panTo(pos)
        reverseGeocode(pos, { overwrite: true })
      },
      (err) => {
        setLocating(false)
        toast.error(err?.code === 1 ? "Location access was denied — allow it or enter the address manually." : "Could not get your location. Try again.")
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }

  /* ---------------------------------------------------------------- search */
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    if (mapState !== "ready" || query.trim().length < 3) {
      setSuggestions([])
      return undefined
    }
    let alive = true
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const { google, map } = g.current
        if (!g.current.autocomplete) {
          const { AutocompleteService } = await google.maps.importLibrary("places")
          g.current.autocomplete = new AutocompleteService()
        }
        const res = await g.current.autocomplete.getPlacePredictions({
          input: query.trim(),
          componentRestrictions: { country: "in" },
          locationBias: map.getCenter(),
        })
        if (alive) setSuggestions((res?.predictions || []).slice(0, 5))
      } catch {
        if (alive) setSuggestions([])
      } finally {
        if (alive) setSearching(false)
      }
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, mapState])

  const pickSuggestion = async (s) => {
    setSuggestions([])
    setQuery(s.structured_formatting?.main_text || s.description)
    try {
      const { results } = await g.current.geocoder.geocode({ placeId: s.place_id })
      const r = results?.[0]
      const loc = r?.geometry?.location?.toJSON?.()
      if (!loc) throw new Error("no location")
      const found = addressFromGeocode(r)
      g.current.map.panTo(loc)
      setForm((f) => ({
        ...f,
        pin: loc,
        street: f.street || found.street,
        city: found.city || f.city,
        state: found.state || f.state,
        zipCode: found.zipCode || f.zipCode,
      }))
      setLookup({ status: "ready", text: found.formatted })
      setErrors((er) => ({ ...er, pin: undefined }))
    } catch {
      toast.error("We could not locate this place. Try another search or move the map.")
    }
  }

  /* ---------------------------------------------------------------- save */
  const save = async (e) => {
    e.preventDefault()
    const found = validate(form)
    setErrors(found)
    const first = Object.values(found)[0]
    if (first) {
      toast.error(first)
      return
    }
    const body = {
      label: form.label,
      additionalDetails: form.additionalDetails.trim(),
      street: form.street.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zipCode: form.zipCode,
      phone: form.phone,
      latitude: form.pin.lat,
      longitude: form.pin.lng,
    }
    setSaving(true)
    try {
      if (editing) {
        await updateAddress(addressIdOf(editing), body)
      } else {
        const saved = await addAddress(body)
        if (saved) setSelectedId(addressIdOf(saved))
      }
      toast.success("Address saved")
      if (window.history.length > 1) navigate(-1)
      else navigate("/food/user/addresses", { replace: true })
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save this address. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/food/user/addresses"))

  if (addressId && !editing && addresses.length > 0) {
    return (
      <div className="fa">
        <header className="fa-head">
          <IconButton label="Back" onClick={back}>
            <ArrowLeft />
          </IconButton>
          <h1>Edit address</h1>
        </header>
        <div className="fa-empty">
          <h2>This address isn&apos;t in your account</h2>
          <Button block={false} size="md" onClick={() => navigate("/food/user/addresses", { replace: true })}>
            See saved addresses
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fa">
      <header className="fa-head">
        <IconButton label="Back" onClick={back}>
          <ArrowLeft />
        </IconButton>
        <h1>{editing ? "Edit address" : "Add address"}</h1>
      </header>

      <form className="fa-form" onSubmit={save} noValidate>
        {/* ---------------- map ---------------- */}
        <div className="fa-map">
          <div ref={mapEl} className="fa-map__canvas" role="region" aria-label="Move the map to place the pin on your door" />
          {mapState === "off" && (
            <div className="fa-map__off">
              <p>The map isn&apos;t available right now. Use your current location to pin this address.</p>
            </div>
          )}
          {mapState === "ready" && (
            <>
              <span className={dragging ? "fa-pin is-lifted" : "fa-pin"} aria-hidden="true">
                <MapPin />
                <i />
              </span>
              <span className="fa-map__chip">
                {lookup.status === "loading" ? (
                  <>
                    <Loader2 className="fa-spin" aria-hidden="true" />
                    Finding this address…
                  </>
                ) : (
                  <>
                    <MapPin aria-hidden="true" />
                    {lookup.text || "Move the map to your door"}
                  </>
                )}
              </span>
            </>
          )}
          <button type="button" className="fa-map__locate" onClick={useCurrentLocation} disabled={locating}>
            {locating ? <Loader2 className="fa-spin" aria-hidden="true" /> : <Crosshair aria-hidden="true" />}
            Use current location
          </button>
        </div>
        {errors.pin && (
          <p className="fa-error" role="alert">
            {errors.pin}
          </p>
        )}

        {/* ---------------- search ---------------- */}
        {mapState === "ready" && (
          <div className="fa-search">
            <Search aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a building, street or area"
              aria-label="Search for a place"
              autoComplete="off"
            />
            {searching ? (
              <Loader2 className="fa-spin" aria-hidden="true" />
            ) : (
              query && (
                <IconButton label="Clear search" onClick={() => setQuery("")}>
                  <X />
                </IconButton>
              )
            )}
            {suggestions.length > 0 && (
              <ul className="fa-suggest" role="listbox" aria-label="Places">
                {suggestions.map((s) => (
                  <li key={s.place_id}>
                    <button type="button" role="option" aria-selected="false" onClick={() => pickSuggestion(s)}>
                      <MapPin aria-hidden="true" />
                      <span>
                        <b>{s.structured_formatting?.main_text || s.description}</b>
                        <small>{s.structured_formatting?.secondary_text || ""}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ---------------- label ---------------- */}
        <fieldset className="fa-labels">
          <legend>Save as</legend>
          <div role="radiogroup" aria-label="Save as">
            {LABELS.map(([label, Icon]) => (
              <button key={label} type="button" role="radio" aria-checked={form.label === label} onClick={() => setForm((f) => ({ ...f, label }))}>
                <Icon aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {taken && <p className="fa-note">Saving replaces your current {form.label} address ({taken.street || taken.city}).</p>}
        </fieldset>

        {/* ---------------- fields ---------------- */}
        <Field id="fa-house" label="House / flat / block number" error={errors.additionalDetails}>
          <input id="fa-house" value={form.additionalDetails} onChange={set("additionalDetails")} placeholder="e.g. B-402, Lakeview Residency" autoComplete="address-line2" />
        </Field>
        <Field id="fa-street" label="Street / area" error={errors.street}>
          <input id="fa-street" value={form.street} onChange={set("street")} placeholder="e.g. Station Road, near the city library" autoComplete="address-line1" />
        </Field>
        <div className="fa-row">
          <Field id="fa-city" label="City" error={errors.city}>
            <input id="fa-city" value={form.city} onChange={set("city")} autoComplete="address-level2" />
          </Field>
          <Field id="fa-state" label="State" error={errors.state}>
            <input id="fa-state" value={form.state} onChange={set("state")} autoComplete="address-level1" />
          </Field>
        </div>
        <div className="fa-row">
          <Field id="fa-zip" label="Pincode" error={errors.zipCode}>
            <input id="fa-zip" value={form.zipCode} onChange={set("zipCode")} inputMode="numeric" autoComplete="postal-code" />
          </Field>
          <Field id="fa-phone" label="Phone (optional)" error={errors.phone}>
            <input id="fa-phone" value={form.phone} onChange={set("phone")} inputMode="numeric" autoComplete="tel-national" />
          </Field>
        </div>

        <Button type="submit" loading={saving} disabled={saving}>
          {editing ? "Update address" : "Save address"}
        </Button>
      </form>
    </div>
  )
}

function Field({ id, label, error, children }) {
  return (
    <div className={error ? "fa-field has-error" : "fa-field"}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <span className="fa-error">{error}</span>}
    </div>
  )
}

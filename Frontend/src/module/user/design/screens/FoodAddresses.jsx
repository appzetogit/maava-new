import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Briefcase, CheckCircle2, Home, MapPin, MapPinOff, Pencil, Plus, Trash2 } from "lucide-react"
import { useProfile } from "../../context/ProfileContext"
import { BottomSheet, Button, IconButton, SkeletonBox, toast } from "../index"
import { addressIdOf, coordsOf, useStoredAddressId } from "../data/useCheckout"
import "./addresses.css"

/**
 * Delivery addresses, rebuilt from the app's address list
 * (quick/ui/screens/address/addresses_screen.dart, used by Food's /addresses).
 *
 * Each card: label, DEFAULT pill, full address, a warning when it isn't pinned
 * on the map, and Edit / Set as default / Delete. Tapping a card makes it the
 * delivery address the cart uses. The current site has no page like this, and
 * its edit/delete/default silently did nothing (they matched on addr.id; the
 * backend sends _id).
 */
export const LABEL_ICON = { Home, Office: Briefcase, Other: MapPin }

export const formatAddressLine = (a) =>
  [a.additionalDetails, a.street, a.city, a.state, a.zipCode].map((p) => String(p || "").trim()).filter(Boolean).join(", ")

export default function FoodAddresses() {
  const navigate = useNavigate()
  const { addresses = [], loading, deleteAddress, setDefaultAddress } = useProfile()
  const [selectedId, setSelectedId] = useStoredAddressId()
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(null)

  const fallbackId = addressIdOf(addresses.find((a) => a.isDefault) || addresses[0])
  const activeId = addresses.some((a) => addressIdOf(a) === selectedId) ? selectedId : fallbackId
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/food/user/profile"))

  const choose = (a) => {
    setSelectedId(addressIdOf(a))
    toast.success(`Delivering to ${a.label || "this address"}`)
    if (window.history.length > 1) navigate(-1)
  }

  const makeDefault = async (a) => {
    const id = addressIdOf(a)
    setBusy(id)
    const ok = await setDefaultAddress(id)
    setBusy(null)
    if (ok) toast.success(`${a.label || "Address"} is now your default`)
    else toast.error("Could not set the default address. Please try again.")
  }

  const remove = async () => {
    const a = confirm
    setConfirm(null)
    if (!a) return
    const id = addressIdOf(a)
    setBusy(id)
    try {
      await deleteAddress(id)
      if (selectedId === id) setSelectedId("")
      toast.success("Address deleted")
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not delete this address")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fa">
      <header className="fa-head">
        <IconButton label="Back" onClick={back}>
          <ArrowLeft />
        </IconButton>
        <h1>Delivery addresses</h1>
      </header>

      <main className="fa-body">
        {loading && addresses.length === 0 ? (
          <div className="fa-list" aria-busy="true" aria-label="Loading your addresses">
            <SkeletonBox height={108} radius={16} />
            <SkeletonBox height={108} radius={16} />
            <SkeletonBox height={108} radius={16} />
          </div>
        ) : addresses.length === 0 ? (
          <div className="fa-empty">
            <span className="fa-empty__icon" aria-hidden="true">
              <MapPinOff />
            </span>
            <h2>No saved addresses</h2>
            <p>Add one so we know where to bring your order — it takes a moment.</p>
          </div>
        ) : (
          <ul className="fa-list">
            {addresses.map((a) => {
              const id = addressIdOf(a)
              const Icon = LABEL_ICON[a.label] || MapPin
              const selected = id === activeId
              return (
                <li key={id} className={selected ? "fa-card is-selected" : "fa-card"}>
                  <button type="button" className="fa-card__main" onClick={() => choose(a)} aria-pressed={selected}>
                    <span className="fa-card__top">
                      <Icon aria-hidden="true" />
                      <b>{a.label || "Address"}</b>
                      {a.isDefault && <em>DEFAULT</em>}
                      {selected && <CheckCircle2 className="fa-card__check" aria-label="Delivering here" />}
                    </span>
                    <span className="fa-card__line">{formatAddressLine(a)}</span>
                    {!coordsOf(a) && <span className="fa-card__warn">Not pinned on the map — delivery fees may be estimated</span>}
                  </button>
                  <div className="fa-card__actions">
                    <button type="button" onClick={() => navigate(`/food/user/addresses/${encodeURIComponent(id)}/edit`)}>
                      <Pencil aria-hidden="true" />
                      Edit
                    </button>
                    {!a.isDefault && (
                      <button type="button" onClick={() => makeDefault(a)} disabled={busy === id}>
                        Set as default
                      </button>
                    )}
                    <IconButton label={`Delete ${a.label || "address"}`} className="fa-card__delete" onClick={() => setConfirm(a)} disabled={busy === id}>
                      <Trash2 />
                    </IconButton>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      <footer className="fa-foot">
        <Button onClick={() => navigate("/food/user/addresses/new")} leading={<Plus aria-hidden="true" />}>
          Add a new address
        </Button>
      </footer>

      <BottomSheet open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Delete this address?">
        <p className="mv-body-medium">{confirm ? formatAddressLine(confirm) : ""}</p>
        <div className="fa-sheet-actions">
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <button type="button" className="fa-danger" onClick={remove}>
            Delete
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

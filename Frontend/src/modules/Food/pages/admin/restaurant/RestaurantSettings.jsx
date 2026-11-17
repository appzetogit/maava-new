import React, { useEffect, useState } from "react"
import { adminAPI } from "@/services/api"
import { Button } from "@food/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@food/components/ui/card"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { Clock, GalleryHorizontal, Loader2, Pencil, Save, Trash2, Trophy } from "lucide-react"
import { Switch } from "@food/components/ui/switch"
import { toast } from "sonner"
import { vt } from "@food/utils/adminVerticalLabels"

const MIN_MINUTES = 1
const MAX_MINUTES = 20
const DEFAULT_MINUTES = 4
// Half-minute steps, so a 1:30 timer can be set.
const STEP_MINUTES = 0.5

const clampMinutes = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_MINUTES
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(numeric * 2) / 2))
}

// 1.5 -> "1:30 min", 4 -> "4:00 min": what the restaurant's countdown starts at.
const formatTimer = (minutes) => {
  const totalSeconds = Math.round(minutes * 60)
  const secs = String(totalSeconds % 60).padStart(2, "0")
  return `${Math.floor(totalSeconds / 60)}:${secs} min`
}

const MAX_TITLE = 40

/**
 * The horizontal card row (a restaurant's combos) on the customer app's menu
 * page. Off by default; when off, or when a restaurant has no combos, the app
 * renders nothing in its place.
 */
function RestaurantCarouselCard() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState({ enabled: false, title: "Combos" })
  const [enabled, setEnabled] = useState(false)
  const [title, setTitle] = useState("Combos")

  useEffect(() => {
    const load = async () => {
      try {
        const response = await adminAPI.getRestaurantCarouselSettings()
        const value = response?.data?.data?.restaurantCarousel
        if (value) {
          setSaved(value)
          setEnabled(value.enabled)
          setTitle(value.title)
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load the menu carousel settings.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const trimmed = title.trim()
  const isDirty = enabled !== saved.enabled || trimmed !== saved.title
  const isValid = trimmed.length > 0 && trimmed.length <= MAX_TITLE

  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await adminAPI.updateRestaurantCarouselSettings({ enabled, title: trimmed })
      const value = response?.data?.data?.restaurantCarousel ?? { enabled, title: trimmed }
      setSaved(value)
      setEnabled(value.enabled)
      setTitle(value.title)
      toast.success("Menu carousel updated.")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update the menu carousel.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-6 border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <GalleryHorizontal className="h-5 w-5 text-slate-600" />
          <CardTitle className="text-lg">Menu Carousel</CardTitle>
        </div>
        <CardDescription>
          A swipeable row of a restaurant&apos;s combos at the top of its menu in the customer app.
          Hidden when off, or for restaurants with no combos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="restaurantCarouselEnabled">Show the carousel</Label>
              <Switch id="restaurantCarouselEnabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="restaurantCarouselTitle">Section title</Label>
              <Input
                id="restaurantCarouselTitle"
                value={title}
                maxLength={MAX_TITLE}
                placeholder="e.g. Combo Deals, Top Picks, Buy 1 Get 1"
                onChange={(event) => setTitle(event.target.value)}
              />
              {!isValid && <p className="text-sm text-red-600">Enter a title of 1 to {MAX_TITLE} characters.</p>}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || !isValid || saving}
                className="min-w-[120px]"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const EMPTY_SLOT = { restaurantId: "", rank: "1", startAt: "", endAt: "", dailyStart: "", dailyEnd: "" }

// <input type="datetime-local"> works in local time without a zone suffix.
const toLocalInput = (iso) => {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const formatWhen = (iso) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

const slotStatus = (slot) => {
  const now = Date.now()
  if (new Date(slot.endAt).getTime() <= now) return { label: "Expired", tone: "bg-gray-100 text-gray-600" }
  if (new Date(slot.startAt).getTime() > now) return { label: "Scheduled", tone: "bg-amber-100 text-amber-700" }
  return { label: "Live", tone: "bg-green-100 text-green-700" }
}

const idOf = (value) => String(value?._id ?? value ?? "")

/**
 * Paid Top 10 placements: pin a restaurant at a rank (1-10) in one zone's
 * customer home list for a date range, optionally only during set daily hours.
 * Expired slots stop applying on their own.
 */
function TopRestaurantsCard() {
  const [zones, setZones] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [zoneId, setZoneId] = useState("")
  const [slots, setSlots] = useState([])
  const [form, setForm] = useState(EMPTY_SLOT)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [zonesRes, restaurantsRes] = await Promise.all([
          adminAPI.getZones({ isActive: true }),
          adminAPI.getRestaurants({ status: "approved", limit: 1000 }),
        ])
        const zoneList = zonesRes?.data?.data?.zones || []
        setZones(zoneList)
        setRestaurants(restaurantsRes?.data?.data?.restaurants || [])
        if (zoneList.length) setZoneId(idOf(zoneList[0]))
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load zones and restaurants.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const loadSlots = async (zone) => {
    if (!zone) return setSlots([])
    try {
      const res = await adminAPI.getTopRestaurantSlots({ zoneId: zone })
      setSlots(res?.data?.data?.slots || [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load Top 10 slots.")
    }
  }

  useEffect(() => {
    loadSlots(zoneId)
    setForm(EMPTY_SLOT)
    setEditingId(null)
  }, [zoneId])

  const zoneRestaurants = restaurants.filter((r) => idOf(r.zoneId) === zoneId)
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const handleSave = async () => {
    if (!form.restaurantId || !form.startAt || !form.endAt) {
      toast.error("Pick a restaurant and both start and end date/time.")
      return
    }
    const body = {
      zoneId,
      restaurantId: form.restaurantId,
      rank: Number(form.rank),
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      dailyStart: form.dailyStart,
      dailyEnd: form.dailyEnd,
    }
    try {
      setSaving(true)
      if (editingId) await adminAPI.updateTopRestaurantSlot(editingId, body)
      else await adminAPI.createTopRestaurantSlot(body)
      toast.success(editingId ? "Top 10 slot updated." : "Top 10 slot added.")
      setForm(EMPTY_SLOT)
      setEditingId(null)
      loadSlots(zoneId)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save the slot.")
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (slot) => {
    setEditingId(slot._id)
    setForm({
      restaurantId: idOf(slot.restaurantId),
      rank: String(slot.rank),
      startAt: toLocalInput(slot.startAt),
      endAt: toLocalInput(slot.endAt),
      dailyStart: slot.dailyStart || "",
      dailyEnd: slot.dailyEnd || "",
    })
  }

  const handleDelete = async (slot) => {
    if (!window.confirm(`Remove ${slot.restaurantId?.restaurantName || "this restaurant"} from rank ${slot.rank}?`)) return
    try {
      await adminAPI.deleteTopRestaurantSlot(slot._id)
      toast.success("Top 10 slot removed.")
      loadSlots(zoneId)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to remove the slot.")
    }
  }

  const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"

  return (
    <Card className="mt-6 border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-slate-600" />
          <CardTitle className="text-lg">Top 10 Restaurants</CardTitle>
        </div>
        <CardDescription>
          Pin restaurants to the top of the customer app&apos;s home list in a zone, by rank, for a set period.
          When the period ends they return to the normal list on their own. Daily hours are optional
          (e.g. 07:00&ndash;11:00 for breakfast); leave them blank for all day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="topZone">Zone</Label>
              <select id="topZone" className={selectClass} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                {zones.map((z) => (
                  <option key={idOf(z)} value={idOf(z)}>{z.name || z.zoneName}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 rounded-lg border border-slate-200 p-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="topRestaurant">Restaurant</Label>
                <select id="topRestaurant" className={selectClass} value={form.restaurantId} onChange={set("restaurantId")}>
                  <option value="">Select a restaurant in this zone</option>
                  {zoneRestaurants.map((r) => (
                    <option key={idOf(r)} value={idOf(r)}>{r.restaurantName || r.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="topRank">Rank</Label>
                <select id="topRank" className={selectClass} value={form.rank} onChange={set("rank")}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>#{i + 1}</option>
                  ))}
                </select>
              </div>
              <div className="hidden md:block" />
              <div className="space-y-2">
                <Label htmlFor="topStart">Start date &amp; time</Label>
                <Input id="topStart" type="datetime-local" value={form.startAt} onChange={set("startAt")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topEnd">End date &amp; time</Label>
                <Input id="topEnd" type="datetime-local" value={form.endAt} onChange={set("endAt")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topDailyStart">Daily from (optional)</Label>
                <Input id="topDailyStart" type="time" value={form.dailyStart} onChange={set("dailyStart")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topDailyEnd">Daily until (optional)</Label>
                <Input id="topDailyEnd" type="time" value={form.dailyEnd} onChange={set("dailyEnd")} />
              </div>
              <div className="flex justify-end gap-2 md:col-span-2">
                {editingId && (
                  <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY_SLOT) }}>
                    Cancel
                  </Button>
                )}
                <Button type="button" onClick={handleSave} disabled={saving || !zoneId} className="min-w-[140px]">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {editingId ? "Update slot" : "Add to Top 10"}
                </Button>
              </div>
            </div>

            {slots.length === 0 ? (
              <p className="text-sm text-gray-500">No Top 10 slots in this zone yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-gray-500">
                    <tr>
                      <th className="py-2 pr-3">Rank</th>
                      <th className="py-2 pr-3">Restaurant</th>
                      <th className="py-2 pr-3">Period</th>
                      <th className="py-2 pr-3">Daily hours</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((slot) => {
                      const status = slotStatus(slot)
                      return (
                        <tr key={slot._id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-semibold">#{slot.rank}</td>
                          <td className="py-2 pr-3">{slot.restaurantId?.restaurantName || "—"}</td>
                          <td className="py-2 pr-3">{formatWhen(slot.startAt)} – {formatWhen(slot.endAt)}</td>
                          <td className="py-2 pr-3">{slot.dailyStart ? `${slot.dailyStart}–${slot.dailyEnd}` : "All day"}</td>
                          <td className="py-2 pr-3">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>
                          </td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(slot)} aria-label="Edit slot">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(slot)} aria-label="Remove slot">
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function RestaurantSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMinutes, setSavedMinutes] = useState(DEFAULT_MINUTES)
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true)
        const response = await adminAPI.getRestaurantOrderAcceptanceSettings()
        const value = clampMinutes(response?.data?.data?.orderAcceptanceTimeMinutes)
        setSavedMinutes(value)
        setMinutes(value)
      } catch (error) {
        toast.error(error?.response?.data?.message || vt("Failed to load seller settings."))
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [])

  const handleSave = async () => {
    const value = clampMinutes(minutes)
    try {
      setSaving(true)
      const response = await adminAPI.updateRestaurantOrderAcceptanceSettings({
        orderAcceptanceTimeMinutes: value,
      })
      const updatedValue = clampMinutes(response?.data?.data?.orderAcceptanceTimeMinutes ?? value)
      setSavedMinutes(updatedValue)
      setMinutes(updatedValue)
      toast.success("Order acceptance time updated.")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update order acceptance time.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[360px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const currentMinutes = clampMinutes(minutes)
  const isDirty = currentMinutes !== savedMinutes

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{vt("Seller Settings")}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set the order acceptance timer for all restaurants.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-600" />
            <CardTitle className="text-lg">Order Acceptance Time</CardTitle>
          </div>
          <CardDescription>
            New restaurant order popups will use this value. Existing active orders keep their current timer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="orderAcceptanceTimeMinutes">Timer duration</Label>
              <span className="text-sm font-semibold text-gray-900">{formatTimer(currentMinutes)}</span>
            </div>
            <Input
              id="orderAcceptanceTimeMinutes"
              type="range"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              step={STEP_MINUTES}
              value={currentMinutes}
              onChange={(event) => setMinutes(clampMinutes(event.target.value))}
              className="h-10"
            />
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                step={STEP_MINUTES}
                value={currentMinutes}
                onChange={(event) => setMinutes(clampMinutes(event.target.value))}
                className="w-28"
              />
              <span className="text-sm text-gray-500">Minutes, 1 to 20, in half-minute steps (1.5 = 1:30)</span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSave} disabled={!isDirty || saving} className="min-w-[120px]">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <RestaurantCarouselCard />

      <TopRestaurantsCard />
    </div>
  )
}

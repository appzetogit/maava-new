import { useState, useEffect } from "react"
import { Save, Loader2, DollarSign, Plus, Trash2, Edit, Check, X } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


// Fee Settings Component - Range-based delivery fee configuration
export default function FeeSettings() {
  const [feeSettings, setFeeSettings] = useState({
    deliveryFee: "",
    deliveryFeeRanges: [],
    platformFee: "",
    // Packaging goes to the restaurant, not to us: a flat amount per order
    // plus an optional amount for every item boxed.
    packagingFee: "",
    packagingFeePerItem: "",
    quickDeliveryFee: "",
    gstRate: "",
    // GST on the delivery fee itself, the free-delivery target and the tip
    // amounts. All three are per zone, like every other figure here.
    deliveryFeeGstRate: "",
    freeDeliveryThreshold: "",
    tipPresets: "",
    // Distance pricing: base fee covers the base distance, then per km.
    baseDeliveryKm: "",
    baseDeliveryFee: "",
    perKmFee: "",
    maxDeliveryFee: "",
    // Rider pay: base amount for the base distance, then per extra km.
    riderBaseKm: "",
    riderBasePay: "",
    riderPerKmPay: "",
    riderMaxPay: "",
    // Free delivery for people who just joined.
    newCustomerFreeDelivery: false,
    newCustomerFreeDeliveryOrders: "",
    newCustomerFreeDeliveryDays: "",
    newCustomerMinOrder: "",
  })
  const [loadingFeeSettings, setLoadingFeeSettings] = useState(false)
  const [savingFeeSettings, setSavingFeeSettings] = useState(false)
  // Fees are set per delivery zone. "" is the default every zone falls back to.
  const [zones, setZones] = useState([])
  const [selectedZoneId, setSelectedZoneId] = useState("")
  const [isZoneOverride, setIsZoneOverride] = useState(false)
  const [removingZoneFees, setRemovingZoneFees] = useState(false)
  const [editingRangeIndex, setEditingRangeIndex] = useState(null)
  // The default record, when a zone is selected, so each field can say what
  // the zone would inherit.
  const [defaults, setDefaults] = useState(null)
  // How the customer fee and the rider pay are worked out. Per km means the
  // base fields are set; bands means they are cleared on save and the band
  // table applies -- the same data the server already reads.
  const [customerMode, setCustomerMode] = useState('perkm')
  const [riderMode, setRiderMode] = useState('perkm')
  const [example, setExample] = useState({ km: '4', basket: '250' })
  const [newRange, setNewRange] = useState({ 
    min: '', 
    max: '', 
    fee: '0', 
    deliveryBoyPerKm: '0', 
    deliveryBoyBasePay: '0' 
  })

  const readFeeSettings = (doc) => ({
    deliveryFee: doc?.deliveryFee ?? "",
    deliveryFeeRanges: doc?.deliveryFeeRanges || [],
    platformFee: doc?.platformFee ?? "",
    packagingFee: doc?.packagingFee ?? "",
    packagingFeePerItem: doc?.packagingFeePerItem ?? "",
    quickDeliveryFee: doc?.quickDeliveryFee ?? "",
    gstRate: doc?.gstRate ?? "",
    deliveryFeeGstRate: doc?.deliveryFeeGstRate ?? "",
    freeDeliveryThreshold: doc?.freeDeliveryThreshold ?? "",
    tipPresets: Array.isArray(doc?.tipPresets) ? doc.tipPresets.join(", ") : "",
    baseDeliveryKm: doc?.baseDeliveryKm ?? "",
    baseDeliveryFee: doc?.baseDeliveryFee ?? "",
    perKmFee: doc?.perKmFee ?? "",
    maxDeliveryFee: doc?.maxDeliveryFee ?? "",
    riderBaseKm: doc?.riderBaseKm ?? "",
    riderBasePay: doc?.riderBasePay ?? "",
    riderPerKmPay: doc?.riderPerKmPay ?? "",
    riderMaxPay: doc?.riderMaxPay ?? "",
    newCustomerFreeDelivery: Boolean(doc?.newCustomerFreeDelivery),
    newCustomerFreeDeliveryOrders: doc?.newCustomerFreeDeliveryOrders ?? "",
    newCustomerFreeDeliveryDays: doc?.newCustomerFreeDeliveryDays ?? "",
    newCustomerMinOrder: doc?.newCustomerMinOrder ?? "",
  })

  // An empty box clears the value on the server; a number sets it.
  const numberOrClear = (value) => (value === "" || value === null ? null : Number(value))

  // What a delivery of this distance would cost under the current inputs.
  const previewDeliveryFee = (km) => {
    const baseKm = Number(feeSettings.baseDeliveryKm)
    const baseFee = Number(feeSettings.baseDeliveryFee)
    if (!Number.isFinite(baseKm) || !Number.isFinite(baseFee) || feeSettings.baseDeliveryFee === "") return null
    const perKm = Number(feeSettings.perKmFee) || 0
    const extraKm = Math.max(0, Number((km - baseKm).toFixed(2)))
    const cap = Number(feeSettings.maxDeliveryFee)
    const total = baseFee + extraKm * perKm
    const capped = feeSettings.maxDeliveryFee !== "" && Number.isFinite(cap) && cap > 0 ? Math.min(total, cap) : total
    return { extraKm, total: Math.round(capped), capped: capped < total }
  }

  const usingBasePricing = feeSettings.baseDeliveryFee !== "" && feeSettings.baseDeliveryKm !== ""

  // What a rider would earn for a trip of this length under the current inputs.
  const previewRiderPay = (km) => {
    if (feeSettings.riderBasePay === "") return null
    const baseKm = Number(feeSettings.riderBaseKm) || 0
    const basePay = Number(feeSettings.riderBasePay) || 0
    const perKm = Number(feeSettings.riderPerKmPay) || 0
    const extraKm = Math.max(0, Number((km - baseKm).toFixed(2)))
    const total = basePay + extraKm * perKm
    const cap = Number(feeSettings.riderMaxPay)
    const capped = feeSettings.riderMaxPay !== "" && Number.isFinite(cap) && cap > 0 ? Math.min(total, cap) : total
    return { extraKm, total: Math.round(capped), capped: capped < total }
  }

  const usingRiderBasePay = feeSettings.riderBasePay !== ""

  // Fetch fee settings for the chosen zone (or the default ones).
  const fetchFeeSettings = async (zoneId = selectedZoneId) => {
    try {
      setLoadingFeeSettings(true)
      const response = await adminAPI.getFeeSettings(zoneId ? { zoneId } : {})
      if (response.data.success) {
        const data = response.data.data || {}
        const own = data.feeSettings
        setIsZoneOverride(Boolean(zoneId && data.isZoneOverride))
        // A zone with no fees of its own opens on the default figures, so saving
        // is a deliberate change from them rather than starting from blank.
        const loaded = readFeeSettings(own || (zoneId ? data.defaultFeeSettings : null))
        setFeeSettings(loaded)
        setDefaults(zoneId ? readFeeSettings(data.defaultFeeSettings) : null)
        const hasBands = loaded.deliveryFeeRanges.length > 0
        setCustomerMode(loaded.baseDeliveryFee !== "" || !hasBands ? 'perkm' : 'bands')
        setRiderMode(loaded.riderBasePay !== "" || !hasBands ? 'perkm' : 'bands')
      }
    } catch (error) {
      debugError('Error fetching fee settings:', error)
      toast.error('Failed to load fee settings')
    } finally {
      setLoadingFeeSettings(false)
    }
  }

  // Zones to choose from.
  const fetchZones = async () => {
    try {
      const response = await adminAPI.getZones({ limit: 1000 })
      const body = response?.data?.data ?? response?.data ?? {}
      const list = Array.isArray(body) ? body : body.zones || body.data || []
      setZones(list.filter((z) => z && z._id))
    } catch (error) {
      debugError('Error fetching zones:', error)
    }
  }

  useEffect(() => {
    fetchZones()
  }, [])

  // Reload whenever the zone changes.
  useEffect(() => {
    fetchFeeSettings(selectedZoneId)
  }, [selectedZoneId])

  // Unified save function
  const saveSettings = async (settingsInput) => {
    // The section not in use is cleared, so what is saved is what the switch shows.
    const settingsToSave = { ...settingsInput }
    if (customerMode === 'bands') {
      Object.assign(settingsToSave, { baseDeliveryKm: "", baseDeliveryFee: "", perKmFee: "", maxDeliveryFee: "" })
    }
    if (riderMode === 'bands') {
      Object.assign(settingsToSave, { riderBaseKm: "", riderBasePay: "", riderPerKmPay: "", riderMaxPay: "" })
    }
    try {
      setSavingFeeSettings(true)
      const payload = {
        // Saving with a zone selected creates or updates that zone's own fees.
        ...(selectedZoneId ? { zoneId: selectedZoneId } : {}),
        deliveryFee: settingsToSave.deliveryFee === "" ? undefined : Number(settingsToSave.deliveryFee),
        deliveryFeeRanges: settingsToSave.deliveryFeeRanges.map(r => ({
          ...r,
          deliveryBoyPerKm: r.deliveryBoyPerKm === "" ? 0 : Number(r.deliveryBoyPerKm),
          deliveryBoyBasePay: r.deliveryBoyBasePay === "" ? 0 : Number(r.deliveryBoyBasePay),
        })),
        platformFee: settingsToSave.platformFee === "" ? undefined : Number(settingsToSave.platformFee),
        packagingFee: numberOrClear(settingsToSave.packagingFee),
        packagingFeePerItem: numberOrClear(settingsToSave.packagingFeePerItem),
        quickDeliveryFee: settingsToSave.quickDeliveryFee === "" ? undefined : Number(settingsToSave.quickDeliveryFee),
        gstRate: settingsToSave.gstRate === "" ? undefined : Number(settingsToSave.gstRate),
        deliveryFeeGstRate: numberOrClear(settingsToSave.deliveryFeeGstRate),
        freeDeliveryThreshold: numberOrClear(settingsToSave.freeDeliveryThreshold),
        // Empty means "no amounts of our own" -- the apps fall back to their defaults.
        tipPresets: String(settingsToSave.tipPresets || "")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value) && value > 0)
          .slice(0, 6),
        baseDeliveryKm: numberOrClear(settingsToSave.baseDeliveryKm),
        baseDeliveryFee: numberOrClear(settingsToSave.baseDeliveryFee),
        perKmFee: numberOrClear(settingsToSave.perKmFee),
        maxDeliveryFee: numberOrClear(settingsToSave.maxDeliveryFee),
        riderBaseKm: numberOrClear(settingsToSave.riderBaseKm),
        riderBasePay: numberOrClear(settingsToSave.riderBasePay),
        riderPerKmPay: numberOrClear(settingsToSave.riderPerKmPay),
        riderMaxPay: numberOrClear(settingsToSave.riderMaxPay),
        newCustomerFreeDelivery: Boolean(settingsToSave.newCustomerFreeDelivery),
        newCustomerFreeDeliveryOrders: numberOrClear(settingsToSave.newCustomerFreeDeliveryOrders),
        newCustomerFreeDeliveryDays: numberOrClear(settingsToSave.newCustomerFreeDeliveryDays),
        newCustomerMinOrder: numberOrClear(settingsToSave.newCustomerMinOrder),
        isActive: true,
      }
      
      debugLog('[DEBUG] Saving Fee Settings Payload:', payload)
      
      const response = await adminAPI.createOrUpdateFeeSettings(payload)

      if (response.data.success) {
        toast.success(selectedZoneId ? 'Fees saved for this zone' : 'Settings saved successfully')
        const saved = response?.data?.data?.feeSettings
        if (selectedZoneId) setIsZoneOverride(true)
        if (saved) {
          setFeeSettings(readFeeSettings(saved))
        }
        return true
      } else {
        toast.error(response.data.message || 'Failed to save settings')
        return false
      }
    } catch (error) {
      debugError('Error saving fee settings:', error)
      toast.error(error.response?.data?.message || 'Failed to save settings')
      return false
    } finally {
      setSavingFeeSettings(false)
    }
  }

  // Save fee settings (main button)
  const handleSaveFeeSettings = async () => {
    await saveSettings(feeSettings)
  }

  // Send a zone back to the default fees.
  const handleRemoveZoneFees = async () => {
    if (!selectedZoneId) return
    const zoneName = zones.find((z) => String(z._id) === String(selectedZoneId))?.name || 'this zone'
    if (!window.confirm(`Remove the fees set for ${zoneName}? It will use the default fees.`)) return
    try {
      setRemovingZoneFees(true)
      await adminAPI.deleteZoneFeeSettings(selectedZoneId)
      toast.success('Zone now uses the default fees')
      await fetchFeeSettings(selectedZoneId)
    } catch (error) {
      debugError('Error removing zone fees:', error)
      toast.error(error.response?.data?.message || 'Failed to remove zone fees')
    } finally {
      setRemovingZoneFees(false)
    }
  }
  // Check if any range (other than the one being edited) has a base pay set
  const hasBasePayConfigured = (excludeIndex = null) => {
    return feeSettings.deliveryFeeRanges.some((range, idx) => 
      idx !== excludeIndex && Number(range.deliveryBoyBasePay) > 0
    )
  }

  // Add or update delivery fee range
  const handleAddRange = async () => {
    // Robust validation: check if values are present and not just empty strings
    const minRaw = String(newRange.min).trim()
    const maxRaw = String(newRange.max).trim()
    const feeRaw = String(newRange.fee).trim()

    if (minRaw === '' || maxRaw === '' || feeRaw === '') {
      toast.error('Please fill all fields (Min, Max, Fee)')
      return
    }

    const min = Number(minRaw)
    const max = Number(maxRaw)
    const fee = Number(feeRaw)
    const dbPerKm = Number(newRange.deliveryBoyPerKm || 0)
    const dbBasePay = Number(newRange.deliveryBoyBasePay || 0)

    if (isNaN(min) || isNaN(max) || isNaN(fee) || isNaN(dbPerKm) || isNaN(dbBasePay)) {
      toast.error('Please enter valid numbers')
      return
    }

    if (min < 0 || max < 0 || fee < 0 || dbPerKm < 0 || dbBasePay < 0) {
      toast.error('All values must be positive numbers')
      return
    }

    // Mutual exclusivity within range
    if (dbPerKm > 0 && dbBasePay > 0) {
      toast.error('Please set either Per KM Amount or Base Pay, not both')
      return
    }

    // Base Pay uniqueness check
    if (dbBasePay > 0 && hasBasePayConfigured()) {
      toast.error('Base Pay can only be set for one range. It is already configured in another range.')
      return
    }

    if (min >= max) {
      toast.error('Min distance must be less than Max distance')
      return
    }

    // Check for overlapping ranges (excluding the current one being edited)
    const otherRanges = editingRangeIndex !== null
      ? feeSettings.deliveryFeeRanges.filter((_, i) => i !== editingRangeIndex)
      : feeSettings.deliveryFeeRanges

    for (const range of otherRanges) {
      if (
        (min >= range.min && min < range.max) ||
        (max > range.min && max <= range.max) ||
        (min <= range.min && max >= range.max)
      ) {
        toast.error('This range overlaps with an existing range')
        return
      }
    }

    const updatedRanges = [...feeSettings.deliveryFeeRanges, { 
      min, 
      max, 
      fee, 
      deliveryBoyPerKm: dbPerKm, 
      deliveryBoyBasePay: dbBasePay 
    }]
    updatedRanges.sort((a, b) => a.min - b.min)

    const updatedSettings = {
      ...feeSettings,
      deliveryFeeRanges: updatedRanges
    }

    setFeeSettings(updatedSettings)
    
    // Save to DB immediately
    await saveSettings(updatedSettings)

    // Reset state
    setNewRange({ min: '', max: '', fee: '0', deliveryBoyPerKm: '0', deliveryBoyBasePay: '0' })
  }

  // Delete delivery fee range
  const handleDeleteRange = async (index) => {
    const newRanges = feeSettings.deliveryFeeRanges.filter((_, i) => i !== index)
    const updatedSettings = {
      ...feeSettings,
      deliveryFeeRanges: newRanges
    }
    setFeeSettings(updatedSettings)
    await saveSettings(updatedSettings)
  }

  // Edit delivery fee range
  const handleEditRange = (index) => {
    const range = feeSettings.deliveryFeeRanges[index]
    setNewRange({ 
      min: range.min, 
      max: range.max, 
      fee: range.fee || '0',
      deliveryBoyPerKm: range.deliveryBoyPerKm ?? '0',
      deliveryBoyBasePay: range.deliveryBoyBasePay ?? '0'
    })
    setEditingRangeIndex(index)
  }

  // Save edited range
  const handleSaveEditRange = async () => {
    if (newRange.min === '' || newRange.max === '' || newRange.fee === '') {
      toast.error('Please fill all fields')
      return
    }

    const min = Number(newRange.min)
    const max = Number(newRange.max)
    const fee = Number(newRange.fee)
    const dbPerKm = Number(newRange.deliveryBoyPerKm || 0)
    const dbBasePay = Number(newRange.deliveryBoyBasePay || 0)

    if (min < 0 || max < 0 || fee < 0 || dbPerKm < 0 || dbBasePay < 0) {
      toast.error('All values must be positive numbers')
      return
    }

    // Mutual exclusivity within range
    if (dbPerKm > 0 && dbBasePay > 0) {
      toast.error('Please set either Per KM Amount or Base Pay, not both')
      return
    }

    // Base Pay uniqueness check
    if (dbBasePay > 0 && hasBasePayConfigured(editingRangeIndex)) {
      toast.error('Base Pay can only be set for one range. It is already configured in another range.')
      return
    }

    if (min >= max) {
      toast.error('Min value must be less than Max value')
      return
    }

    const ranges = [...feeSettings.deliveryFeeRanges]
    // Remove the range being edited
    ranges.splice(editingRangeIndex, 1)

    // Check for overlapping ranges
    for (const range of ranges) {
      if ((min >= range.min && min < range.max) || (max > range.min && max <= range.max) || (min <= range.min && max >= range.max)) {
        toast.error('This range overlaps with an existing range')
        return
      }
    }

    // Add updated range
    ranges.push({ 
      min, 
      max, 
      fee, 
      deliveryBoyPerKm: dbPerKm, 
      deliveryBoyBasePay: dbBasePay 
    })
    ranges.sort((a, b) => a.min - b.min)

    const updatedSettings = {
      ...feeSettings,
      deliveryFeeRanges: ranges
    }

    setFeeSettings(updatedSettings)
    await saveSettings(updatedSettings)

    setNewRange({ min: '', max: '', fee: '0', deliveryBoyPerKm: '0', deliveryBoyBasePay: '0' })
    setEditingRangeIndex(null)
  }

  // Cancel edit
  const handleCancelEdit = () => {
    setNewRange({ min: '', max: '', fee: '0', deliveryBoyPerKm: '0', deliveryBoyBasePay: '0' })
    setEditingRangeIndex(null)
  }

  const zoneName = zones.find((z) => String(z._id) === String(selectedZoneId))?.name || 'this zone'
  const inputCls =
    "w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all bg-white"

  // One number box. With a zone selected, says what the default is and offers
  // to go back to it when this zone differs.
  const numField = (key, label, { hint, placeholder = "", step = "1", max } = {}) => {
    const inherited = selectedZoneId && defaults ? defaults[key] : ""
    const differs = selectedZoneId && defaults && String(feeSettings[key] ?? "") !== String(inherited ?? "")
    return (
      <div key={key} className="space-y-1.5">
        <label className="block text-sm font-semibold text-slate-700">{label}</label>
        <input
          type="number"
          min="0"
          max={max}
          step={step}
          value={feeSettings[key]}
          onChange={(e) => setFeeSettings({ ...feeSettings, [key]: e.target.value })}
          placeholder={inherited !== "" && inherited !== undefined ? `Default: ${inherited}` : placeholder}
          className={inputCls}
        />
        {differs ? (
          <p className="text-xs text-amber-700">
            Default is {inherited === "" ? "empty" : inherited} ·{" "}
            <button
              type="button"
              onClick={() => setFeeSettings({ ...feeSettings, [key]: inherited ?? "" })}
              className="underline hover:text-amber-900"
            >
              use default
            </button>
          </p>
        ) : (
          hint && <p className="text-xs text-slate-500">{hint}</p>
        )}
      </div>
    )
  }

  // A two-way switch for how a section is priced.
  const modeSwitch = (value, onChange, options) => (
    <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5" role="radiogroup">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
            value === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const section = (title, question, children, aside = null) => (
    <section className="border-t border-slate-200 pt-6 mt-6 first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500 mt-0.5">{question}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )

  const sortedRanges = feeSettings.deliveryFeeRanges
    .map((range, originalIndex) => ({ range, originalIndex }))
    .sort((a, b) => a.range.min - b.range.min)

  // A band table showing either what the customer pays or what the rider earns.
  const bandTable = (side) => {
    const cellCls = "px-4 py-3 text-sm text-slate-900 border-b border-slate-100"
    const editCls = "w-20 px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
    const kmCell = (field, range, isEditing) =>
      isEditing ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={newRange[field]}
            onChange={(e) => setNewRange({ ...newRange, [field]: e.target.value })}
            className={editCls}
          />
          <span className="text-slate-400">km</span>
        </div>
      ) : (
        <>{range[field]} km</>
      )
    return (
      <div className="overflow-x-auto">
        <table className="w-full border border-slate-200 rounded-lg">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">From</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">To</th>
              {side === 'customer' ? (
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">Customer pays</th>
              ) : (
                <>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">Rider: fixed pay</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">or Rider: per km</th>
                </>
              )}
              <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 border-b border-slate-200">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRanges.length === 0 && (
              <tr>
                <td colSpan={side === 'customer' ? 4 : 5} className="px-4 py-6 text-center text-sm text-slate-500">
                  No bands yet — add one below.
                </td>
              </tr>
            )}
            {sortedRanges.map(({ range, originalIndex }) => {
              const isEditing = editingRangeIndex === originalIndex
              return (
                <tr key={originalIndex} className={`${isEditing ? 'bg-blue-50' : 'hover:bg-slate-50'} transition-colors`}>
                  <td className={cellCls}>{kmCell('min', range, isEditing)}</td>
                  <td className={cellCls}>{kmCell('max', range, isEditing)}</td>
                  {side === 'customer' ? (
                    <td className={`${cellCls} font-medium text-green-700`}>
                      {isEditing ? (
                        <input
                          type="number"
                          value={newRange.fee}
                          onChange={(e) => setNewRange({ ...newRange, fee: e.target.value })}
                          className={editCls}
                        />
                      ) : (
                        <>₹{range.fee}</>
                      )}
                    </td>
                  ) : (
                    <>
                      <td className={cellCls}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={newRange.deliveryBoyBasePay}
                            disabled={Number(newRange.deliveryBoyPerKm) > 0 || hasBasePayConfigured(originalIndex)}
                            onChange={(e) => setNewRange({ ...newRange, deliveryBoyBasePay: e.target.value, deliveryBoyPerKm: '0' })}
                            className={editCls}
                          />
                        ) : Number(range.deliveryBoyBasePay) > 0 ? (
                          `₹${range.deliveryBoyBasePay}`
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={cellCls}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={newRange.deliveryBoyPerKm}
                            disabled={Number(newRange.deliveryBoyBasePay) > 0}
                            onChange={(e) => setNewRange({ ...newRange, deliveryBoyPerKm: e.target.value, deliveryBoyBasePay: '0' })}
                            className={editCls}
                          />
                        ) : Number(range.deliveryBoyPerKm) > 0 ? (
                          `₹${range.deliveryBoyPerKm} / km`
                        ) : (
                          '—'
                        )}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-center border-b border-slate-100">
                    <div className="flex items-center justify-center gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={handleSaveEditRange} className="p-1.5 text-green-600 hover:bg-green-100 rounded" title="Save">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={handleCancelEdit} className="p-1.5 text-red-600 hover:bg-red-100 rounded" title="Cancel">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleEditRange(originalIndex)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteRange(originalIndex)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // The add-a-band form. Every band carries both the customer fee and the
  // rider pay, so both are asked for here whichever section it sits in.
  const addBandForm = editingRangeIndex === null && (
    <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-4">
      <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Plus className="w-4 h-4 text-green-600" /> Add a distance band
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        {[
          ['min', 'From (km)', '0'],
          ['max', 'To (km)', '3'],
          ['fee', 'Customer pays (₹)', '0'],
        ].map(([field, label, ph]) => (
          <div key={field}>
            <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
            <input
              type="number"
              min="0"
              step={field === 'fee' ? '1' : '0.1'}
              value={newRange[field]}
              onChange={(e) => setNewRange({ ...newRange, [field]: e.target.value })}
              className={inputCls}
              placeholder={ph}
            />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Rider: fixed pay (₹)</label>
          <input
            type="number"
            min="0"
            value={newRange.deliveryBoyBasePay}
            disabled={Number(newRange.deliveryBoyPerKm) > 0 || hasBasePayConfigured()}
            onChange={(e) => setNewRange({ ...newRange, deliveryBoyBasePay: e.target.value, deliveryBoyPerKm: '0' })}
            className={`${inputCls} disabled:bg-slate-100 disabled:cursor-not-allowed`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">or Rider: per km (₹)</label>
          <input
            type="number"
            min="0"
            value={newRange.deliveryBoyPerKm}
            disabled={Number(newRange.deliveryBoyBasePay) > 0}
            onChange={(e) => setNewRange({ ...newRange, deliveryBoyPerKm: e.target.value, deliveryBoyBasePay: '0' })}
            className={`${inputCls} disabled:bg-slate-100 disabled:cursor-not-allowed`}
          />
        </div>
        <Button onClick={handleAddRange} className="bg-green-600 hover:bg-green-700 text-white text-sm flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Add band
        </Button>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        A band is saved straight away. Rider pay in a band is either a fixed amount or an amount per km, not both.
      </p>
    </div>
  )

  // ---- Example bill: what one order would cost under the figures on screen.
  const exKm = Number(example.km)
  const exBasket = Number(example.basket) || 0
  const bandFor = (km) =>
    sortedRanges.map((r) => r.range).find((r) => km >= Number(r.min) && km <= Number(r.max))
  const threshold = feeSettings.freeDeliveryThreshold === "" ? null : Number(feeSettings.freeDeliveryThreshold)
  let exDelivery = null
  let exDeliveryNote = ""
  if (Number.isFinite(exKm) && example.km !== "") {
    if (customerMode === 'perkm' && previewDeliveryFee(exKm)) {
      const p = previewDeliveryFee(exKm)
      exDelivery = p.total
      exDeliveryNote = p.capped ? 'capped' : p.extraKm > 0 ? `base + ${p.extraKm} km` : 'base price'
    } else if (customerMode === 'bands') {
      const band = bandFor(exKm)
      exDelivery = band ? Number(band.fee) || 0 : Number(feeSettings.deliveryFee) || 0
      exDeliveryNote = band ? `${band.min}–${band.max} km band` : 'no band matches — fallback fee'
    }
    if (exDelivery !== null && threshold !== null && threshold > 0 && exBasket >= threshold) {
      exDelivery = 0
      exDeliveryNote = `free over ₹${threshold}`
    }
  }
  let exRider = null
  if (Number.isFinite(exKm) && example.km !== "") {
    if (riderMode === 'perkm' && previewRiderPay(exKm)) exRider = previewRiderPay(exKm).total
    else if (riderMode === 'bands') {
      const band = bandFor(exKm)
      exRider = !band ? 0 : Number(band.deliveryBoyBasePay) > 0 ? Number(band.deliveryBoyBasePay) : Math.round(exKm * (Number(band.deliveryBoyPerKm) || 0))
    }
  }
  const pct = (key, fallback) => (feeSettings[key] === "" ? fallback : Number(feeSettings[key]) || 0)
  const exItemGst = Math.round(exBasket * pct('gstRate', 0)) / 100
  const exDeliveryGst = exDelivery ? Math.round(exDelivery * pct('deliveryFeeGstRate', 18)) / 100 : 0
  const exPlatform = Number(feeSettings.platformFee) || 0
  const exPackaging = Number(feeSettings.packagingFee) || 0
  const exTotal = exBasket + exItemGst + (exDelivery || 0) + exDeliveryGst + exPlatform + exPackaging
  const exMargin = exDelivery !== null && exRider !== null ? exDelivery - exRider : null
  const rupees = (n) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header: title, zone, save. */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Delivery & Platform Fee</h1>
              <p className="text-sm text-slate-600">What customers pay, what riders earn, and the charges on every bill.</p>
            </div>
          </div>
          <Button
            onClick={handleSaveFeeSettings}
            disabled={savingFeeSettings || loadingFeeSettings}
            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
          >
            {savingFeeSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {savingFeeSettings ? 'Saving...' : 'Save'}
          </Button>
        </div>

        {/* Default fees cover every zone that has none of its own. */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <label htmlFor="fee-zone" className="text-sm font-semibold text-slate-700">Delivery zone</label>
          <select
            id="fee-zone"
            value={selectedZoneId}
            onChange={(e) => setSelectedZoneId(e.target.value)}
            className="min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Default (all zones)</option>
            {zones.map((zone) => (
              <option key={zone._id} value={zone._id}>{zone.name || zone.zoneName || 'Zone'}</option>
            ))}
          </select>
          {selectedZoneId ? (
            isZoneOverride ? (
              <>
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">Custom for this zone</span>
                <Button
                  onClick={handleRemoveZoneFees}
                  disabled={removingZoneFees || savingFeeSettings}
                  className="bg-white text-red-600 border border-red-200 hover:bg-red-50 flex items-center gap-2"
                >
                  {removingZoneFees ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Reset zone to default
                </Button>
              </>
            ) : (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Using the default fees — Save makes these {zoneName}'s own
              </span>
            )
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Used by every zone without its own fees
            </span>
          )}
        </div>
      </div>

      {loadingFeeSettings ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-green-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            {/* 1. Customer delivery fee */}
            {section(
              'What customers pay for delivery',
              customerMode === 'perkm'
                ? 'A starting price covers the first stretch, then each extra km adds a set amount.'
                : 'A fixed fee for each distance band.',
              <>
                {customerMode === 'perkm' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {numField('baseDeliveryKm', 'First (km)', { step: '0.5', placeholder: '1', hint: 'Covered by the starting price' })}
                      {numField('baseDeliveryFee', 'Starting price (₹)', { placeholder: '20' })}
                      {numField('perKmFee', 'Each extra km (₹)', { step: '0.5', placeholder: '5', hint: 'Part km charged pro rata' })}
                      {numField('maxDeliveryFee', 'Never more than (₹)', { placeholder: 'No cap', hint: 'Empty means no cap' })}
                    </div>
                    {usingBasePricing && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[1, 2, 4, 6, 10].map((km) => {
                          const p = previewDeliveryFee(km)
                          return p ? (
                            <span key={km} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-700 tabular-nums">
                              {km} km → <span className="font-semibold">₹{p.total}</span>{p.capped ? ' (capped)' : ''}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {bandTable('customer')}
                    {addBandForm}
                    <div className="mt-4 max-w-xs">
                      {numField('deliveryFee', 'Fee when no band matches (₹)', { placeholder: '0' })}
                    </div>
                  </>
                )}
                {customerMode === 'bands' && selectedZoneId && defaults?.baseDeliveryFee !== "" && defaults?.baseDeliveryFee !== undefined && (
                  <p className="mt-3 text-xs text-amber-700">
                    The default fees use per-km pricing, and a zone cannot switch it off yet — this zone will still be charged per km. Set per-km figures for this zone instead.
                  </p>
                )}
              </>,
              modeSwitch(customerMode, setCustomerMode, [['perkm', 'Per km'], ['bands', 'Distance bands']])
            )}

            {/* 2. Rider pay */}
            {section(
              'What riders earn',
              riderMode === 'perkm'
                ? 'Pay for the first stretch, then an amount for each extra km. Tips go to the rider on top.'
                : 'Pay set per distance band — a fixed amount or an amount per km. Tips go to the rider on top.',
              <>
                {riderMode === 'perkm' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {numField('riderBaseKm', 'First (km)', { step: '0.5', placeholder: '1' })}
                      {numField('riderBasePay', 'Pay for that (₹)', { placeholder: '20' })}
                      {numField('riderPerKmPay', 'Each extra km (₹)', { step: '0.5', placeholder: '5' })}
                      {numField('riderMaxPay', 'Never more than (₹)', { placeholder: 'No cap', hint: 'Empty means no cap' })}
                    </div>
                    {usingRiderBasePay && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[1, 2, 4, 6, 10].map((km) => {
                          const p = previewRiderPay(km)
                          return p ? (
                            <span key={km} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-700 tabular-nums">
                              {km} km → <span className="font-semibold">₹{p.total}</span>{p.capped ? ' (capped)' : ''}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {bandTable('rider')}
                    {addBandForm}
                  </>
                )}
                {riderMode === 'bands' && selectedZoneId && defaults?.riderBasePay !== "" && defaults?.riderBasePay !== undefined && (
                  <p className="mt-3 text-xs text-amber-700">
                    The default fees pay riders per km, and a zone cannot switch it off yet — riders here will still be paid per km.
                  </p>
                )}
              </>,
              modeSwitch(riderMode, setRiderMode, [['perkm', 'Per km'], ['bands', 'Distance bands']])
            )}

            {/* 3. Taxes and other charges */}
            {section(
              'Taxes & other charges',
              'Added to every bill in this zone.',
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {numField('platformFee', 'Platform fee (₹)', { placeholder: '0', hint: 'Per order, kept by the platform' })}
                {numField('packagingFee', 'Packaging per order (₹)', { placeholder: '0', hint: 'Goes to the restaurant' })}
                {numField('packagingFeePerItem', 'Packaging per item (₹)', { placeholder: '0', hint: '3 dishes at ₹5 is ₹15' })}
                {numField('gstRate', 'GST on food (%)', { step: '0.1', max: '100', placeholder: '0' })}
                {numField('deliveryFeeGstRate', 'GST on delivery (%)', { step: '0.1', max: '100', placeholder: '18', hint: 'Empty means 18%. 0 means none.' })}
                {numField('quickDeliveryFee', 'Quick Mode extra (₹)', { placeholder: '0', hint: 'When the customer picks Quick Mode' })}
              </div>
            )}

            {/* 4. Free-delivery offers */}
            {section(
              'Free-delivery offers',
              'When one applies, the customer pays no delivery fee. Riders are still paid as usual.',
              <>
                <div className="max-w-xs">
                  {numField('freeDeliveryThreshold', 'Free delivery on orders over (₹)', { placeholder: 'Off', hint: 'Empty switches it off' })}
                </div>
                <div className="mt-5 rounded-lg border border-slate-200 p-4">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Free delivery for new customers</span>
                      <span className="block text-xs text-slate-500">A welcome for people who just joined</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(feeSettings.newCustomerFreeDelivery)}
                      onChange={(e) => setFeeSettings({ ...feeSettings, newCustomerFreeDelivery: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                    />
                  </label>
                  {feeSettings.newCustomerFreeDelivery && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                        {numField('newCustomerFreeDeliveryOrders', 'First how many orders', { placeholder: '3', hint: 'Counts delivered orders only' })}
                        {numField('newCustomerFreeDeliveryDays', 'Within how many days', { placeholder: '30', hint: 'From the day they signed up' })}
                        {numField('newCustomerMinOrder', 'Minimum order (₹)', { placeholder: 'Any', hint: 'Empty for any order value' })}
                      </div>
                      {!feeSettings.newCustomerFreeDeliveryOrders && !feeSettings.newCustomerFreeDeliveryDays && (
                        <p className="mt-3 text-sm text-amber-700">
                          Set the number of orders, the number of days, or both — otherwise the welcome stays off.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {/* 5. Checkout */}
            {section(
              'Checkout',
              'Tip amounts offered to the customer.',
              <div className="max-w-sm space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Tip amounts (₹)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={feeSettings.tipPresets}
                  onChange={(e) => setFeeSettings({ ...feeSettings, tipPresets: e.target.value })}
                  className={inputCls}
                  placeholder="10, 20, 30, 50"
                />
                <p className="text-xs text-slate-500">Up to 6, separated by commas. Empty uses the app's own amounts.</p>
              </div>
            )}
          </div>

          {/* Example bill, worked out from the figures on screen before saving. */}
          <aside className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 xl:sticky xl:top-4">
            <h3 className="text-base font-semibold text-slate-900">Example order</h3>
            <p className="text-xs text-slate-500 mb-3">Uses the figures on this page, saved or not.</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Distance (km)</label>
                <input type="number" min="0" step="0.5" value={example.km} onChange={(e) => setExample({ ...example, km: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Food total (₹)</label>
                <input type="number" min="0" step="10" value={example.basket} onChange={(e) => setExample({ ...example, basket: e.target.value })} className={inputCls} />
              </div>
            </div>
            <dl className="space-y-1.5 text-sm tabular-nums">
              {[
                ['Food', exBasket],
                exItemGst > 0 && ['GST on food', exItemGst],
                ['Delivery fee', exDelivery, exDeliveryNote],
                exDeliveryGst > 0 && ['GST on delivery', exDeliveryGst],
                exPlatform > 0 && ['Platform fee', exPlatform],
                exPackaging > 0 && ['Packaging', exPackaging],
              ]
                .filter(Boolean)
                .map(([label, value, note]) => (
                  <div key={label}>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="text-slate-900">{value === null ? '—' : value === 0 && label === 'Delivery fee' ? 'FREE' : rupees(value)}</dd>
                    </div>
                    {note && <p className="text-[11px] text-slate-400 text-right">{note}</p>}
                  </div>
                ))}
              <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold">
                <dt className="text-slate-900">Customer pays</dt>
                <dd className="text-slate-900">{rupees(exTotal)}</dd>
              </div>
              <div className="flex justify-between gap-3 pt-2">
                <dt className="text-slate-500">Rider earns</dt>
                <dd className="text-slate-900">{exRider === null ? '—' : rupees(exRider)}</dd>
              </div>
              {exMargin !== null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Delivery margin</dt>
                  <dd className={exMargin > 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>{rupees(exMargin)}</dd>
                </div>
              )}
            </dl>
            {exMargin !== null && exMargin <= 0 && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {exMargin === 0
                  ? 'The rider gets the whole delivery fee — the platform earns nothing on delivery for this order.'
                  : `The platform pays ${rupees(-exMargin)} more to the rider than the customer paid for delivery.`}
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect } from "react"
import { adminAPI } from "@/services/api"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { toast } from "sonner"
import {
  Loader2,
  Save,
  Award,
  TrendingUp,
  Wallet,
  Receipt,
  Sparkles,
  Info,
  Plus,
  Trash2,
} from "lucide-react"

const THEME = "#FA0272"
const GST_RATE = 0.18

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

// Styling for the three tiers this shipped with. Admin-created plans fall back
// to __default -- the catalog is arbitrary now, so there is no per-key entry to
// look up and the card must still render.
const PLAN_META = {
  __default: {
    label: "Plan",
    description: "Custom plan",
    icon: Award,
    accent: "text-[#FA0272]",
    chip: "bg-pink-50 text-[#FA0272]",
    ring: "ring-pink-100",
  },
  starter: {
    label: "Starter",
    description: "For restaurants with lower monthly GMV",
    icon: Award,
    accent: "text-slate-700",
    chip: "bg-slate-100 text-slate-700",
    ring: "ring-slate-200",
  },
  growth: {
    label: "Growth",
    description: "For mid-range monthly GMV",
    icon: Award,
    accent: "text-amber-700",
    chip: "bg-amber-50 text-amber-700",
    ring: "ring-amber-200",
  },
  premium: {
    label: "Premium",
    description: "For high monthly GMV restaurants",
    icon: TrendingUp,
    accent: "text-emerald-700",
    chip: "bg-emerald-50 text-emerald-700",
    ring: "ring-emerald-200",
  },
}

const MoneyInput = ({ id, value, onChange, className = "" }) => (
  <div className={`relative ${className}`}>
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">
      ₹
    </span>
    <Input
      id={id}
      type="number"
      min="0"
      className="h-11 rounded-xl border-gray-200 bg-white pl-8 shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-primary-orange/25"
      value={value}
      onChange={onChange}
    />
  </div>
)

const SubscriptionSettings = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [featureEnabled, setFeatureEnabled] = useState(true)
  const [settings, setSettings] = useState({ onboardingFee: 0 })
  // The plan catalog, any length. Server returns it already sorted by gmvMin.
  const [plans, setPlans] = useState([])
  // Advisory warnings (gaps, overlaps, no unbounded top plan) from the server.
  const [planIssues, setPlanIssues] = useState([])

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getRestaurantSubscriptionSettings()
      try {
        const featureRes = await adminAPI.getFeatureSettings()
        const featureRows = Array.isArray(featureRes?.data?.data) ? featureRes.data.data : []
        const feature = featureRows.find((row) => row.key === "restaurant_subscription")
        if (feature) setFeatureEnabled(Boolean(feature.isEnabled))
      } catch (_featureError) {
        setFeatureEnabled(true)
      }
      if (res.data?.success && res.data.data) {
        const data = res.data.data
        setSettings({ onboardingFee: Number(data?.onboardingFee ?? 0) })
        setPlans(Array.isArray(data?.plans) ? data.plans : [])
        setPlanIssues(Array.isArray(data?.planIssues) ? data.planIssues : [])
      }
    } catch (error) {
      console.error("Error fetching settings:", error)
      toast.error("Failed to load subscription settings.")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!featureEnabled) {
      toast.error("Restaurant Subscription feature is disabled. Enable it from Feature Settings first.")
      return
    }
    try {
      setSaving(true)
      const res = await adminAPI.updateRestaurantSubscriptionSettings({
        ...settings,
        plans,
      })
      if (res.data?.success) {
        toast.success("Subscription settings updated successfully.")
        // Re-read rather than trusting local state: the server sorts by GMV,
        // drops duplicate keys and recomputes the warnings.
        const data = res.data.data
        if (data) {
          setPlans(Array.isArray(data.plans) ? data.plans : [])
          setPlanIssues(Array.isArray(data.planIssues) ? data.planIssues : [])
        }
      }
    } catch (error) {
      console.error("Error saving settings:", error)
      toast.error("Failed to update subscription settings.")
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key, rawValue) => {
    setSettings((prev) => ({ ...prev, [key]: Math.max(0, Number(rawValue) || 0) }))
  }

  const updatePlan = (index, field, rawValue) => {
    setPlans((prev) =>
      prev.map((plan, i) => {
        if (i !== index) return plan
        if (field === "label") return { ...plan, label: rawValue }
        if (field === "isActive") return { ...plan, isActive: rawValue }
        // An empty maximum means "no upper bound", which is meaningfully
        // different from zero -- exactly one plan (the top) should have it.
        if (field === "gmvMax" && String(rawValue).trim() === "") {
          return { ...plan, gmvMax: null }
        }
        return { ...plan, [field]: Math.max(0, Number(rawValue) || 0) }
      }),
    )
  }

  const addPlan = () => {
    setPlans((prev) => {
      const last = prev[prev.length - 1]
      // Starts just above the current top plan so a new row is contiguous by
      // default; an admin adding a tier almost always wants the next band up.
      const nextMin = last ? Math.max(0, Number(last.gmvMax ?? last.gmvMin) || 0) + 1 : 0
      return [
        ...prev,
        {
          key: "",
          label: "",
          price: 0,
          gmvMin: nextMin,
          gmvMax: null,
          isActive: true,
          sortOrder: prev.length,
        },
      ]
    })
  }

  const removePlan = (index) => {
    setPlans((prev) => prev.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex h-[420px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-orange" />
      </div>
    )
  }


  const onboardingFeeBase = Math.max(0, Number(settings.onboardingFee) || 0)
  const onboardingFeeGst =
    onboardingFeeBase > 0 ? Math.round(onboardingFeeBase * GST_RATE * 100) / 100 : 0
  const onboardingFeeTotal = onboardingFeeBase + onboardingFeeGst

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 pb-10">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl opacity-30"
          style={{ backgroundColor: THEME }}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-[#FA0272]">
              <Receipt className="h-3.5 w-3.5" />
              Billing configuration
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Restaurant Subscription Settings
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-gray-500">
              Configure monthly plan pricing, GMV ranges, and the one-time onboarding fee.
              Invoices are generated at month end with plan amount plus 18% GST.
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="ghost"
            className="h-11 shrink-0 cursor-pointer rounded-xl border-0 px-6 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90"
            style={{ backgroundColor: THEME }}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save changes
              </>
            )}
          </Button>
        </div>

        {!featureEnabled ? (
          <div className="relative mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>This section is currently disabled by Feature Settings.</span>
          </div>
        ) : null}
      </div>

      {/* Onboarding fee — top priority */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div
          className="border-b px-6 py-5"
          style={{ background: `linear-gradient(135deg, rgba(250,2,114,0.08) 0%, rgba(250,2,114,0.02) 100%)` }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ backgroundColor: THEME }}
            >
              <Wallet className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">Onboarding fee</h2>
              <p className="mt-1 text-sm text-gray-500">
                One-time fee collected during restaurant onboarding (base + 18% GST). Set to ₹0 to hide and skip payment.
              </p>
            </div>
            {Number(settings.onboardingFee) > 0 ? (
              <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-[#FA0272]">
                Active
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
                Disabled
              </span>
            )}
          </div>
        </div>
        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="max-w-sm space-y-2">
            <Label htmlFor="onboardingFee" className="text-sm font-medium text-gray-700">
              Fee amount
            </Label>
            <MoneyInput
              id="onboardingFee"
              value={settings.onboardingFee}
              onChange={(e) => updateSetting("onboardingFee", e.target.value)}
            />
            <p className="text-xs text-gray-400">
              Base fee before GST. Restaurants pay base + 18% GST on the final onboarding step when greater than zero.
            </p>
          </div>
          <div className="rounded-xl border border-dashed border-pink-200 bg-pink-50/50 px-5 py-4 sm:min-w-[220px]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {onboardingFeeBase > 0 ? "Fee breakdown" : "Current fee"}
            </p>
            {onboardingFeeBase > 0 ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Onboarding fee</span>
                  <span className="font-medium text-gray-800">{formatMoney(onboardingFeeBase)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>GST ({(GST_RATE * 100).toFixed(0)}%)</span>
                  <span className="font-medium text-gray-800">{formatMoney(onboardingFeeGst)}</span>
                </div>
                <div className="flex justify-between border-t border-dashed border-pink-200 pt-2 font-bold text-[#FA0272]">
                  <span>Total collected</span>
                  <span className="text-lg">{formatMoney(onboardingFeeTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-2xl font-bold text-gray-400">{formatMoney(0)}</p>
            )}
          </div>
        </div>
      </section>

      {/* Monthly plans */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Sparkles className="h-4 w-4 text-[#FA0272]" />
          <h2 className="text-lg font-bold text-gray-900">Monthly subscription plans</h2>
        </div>

        {planIssues.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-800">Check these before going live</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {planIssues.map((issue) => (
                <li key={issue} className="text-[12px] text-amber-700">{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          {plans.map((plan, index) => {
            const meta = PLAN_META[plan.key] || PLAN_META.__default
            const Icon = meta.icon
            const isTop = index === plans.length - 1
            return (
              <article
                key={`${plan.key || "new"}-${index}`}
                className={`flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ring-1 ${meta.ring} ${plan.isActive === false ? "opacity-60" : ""}`}
              >
                <div className="border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-1 items-center gap-2.5">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.chip}`}>
                        <Icon className={`h-4 w-4 ${meta.accent}`} />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Input
                          aria-label="Plan name"
                          placeholder="Plan name"
                          className="h-9 rounded-lg border-gray-200 font-bold text-gray-900"
                          value={plan.label}
                          onChange={(e) => updatePlan(index, "label", e.target.value)}
                        />
                        <p className="text-[11px] text-gray-400">
                          {plan.key
                            ? `id: ${plan.key} — fixed, invoices reference it`
                            : "id is created from the name when you save"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 cursor-pointer px-2 text-[11px] font-semibold"
                        onClick={() => updatePlan(index, "isActive", plan.isActive === false)}
                      >
                        {plan.isActive === false ? "Off" : "On"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Remove plan"
                        className="h-8 cursor-pointer px-2 text-gray-400 hover:text-red-600"
                        onClick={() => removePlan(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Monthly price
                    </Label>
                    <MoneyInput
                      id={`price-${index}`}
                      value={plan.price}
                      onChange={(e) => updatePlan(index, "price", e.target.value)}
                    />
                    <p className="text-[11px] text-gray-400">+ 18% GST on monthly invoice</p>
                  </div>

                  <div className="space-y-3 border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">GMV range</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`min-${index}`} className="text-xs text-gray-600">Min GMV</Label>
                        <MoneyInput
                          id={`min-${index}`}
                          value={plan.gmvMin}
                          onChange={(e) => updatePlan(index, "gmvMin", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`max-${index}`} className="text-xs text-gray-600">
                          Max GMV {isTop ? "(leave empty)" : ""}
                        </Label>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
                          <Input
                            id={`max-${index}`}
                            type="number"
                            min="0"
                            placeholder="No limit"
                            className="h-11 rounded-xl border-gray-200 bg-white pl-8 shadow-sm"
                            value={plan.gmvMax === null || plan.gmvMax === undefined ? "" : plan.gmvMax}
                            onChange={(e) => updatePlan(index, "gmvMax", e.target.value)}
                          />
                        </div>
                        <p className="text-[11px] text-gray-400">Empty = no upper limit</p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}

          <button
            type="button"
            onClick={addPlan}
            className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 text-gray-400 transition-colors hover:border-[#FA0272] hover:text-[#FA0272]"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-semibold">Add a plan</span>
          </button>
        </div>

      </section>

      {/* Bottom save */}
      <div className="flex justify-end border-t border-gray-100 pt-6">
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="ghost"
          className="h-11 min-w-[160px] cursor-pointer rounded-xl border-0 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90"
          style={{ backgroundColor: THEME }}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save changes
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

export default SubscriptionSettings

import { useEffect, useState } from "react"
import { Save, Loader2, Wallet } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const debugError = (...args) => {}

const toForm = (s) => ({
  minTopup: s?.minTopup != null ? String(s.minTopup) : "",
  maxTopup: s?.maxTopup != null ? String(s.maxTopup) : "",
})

export default function WalletSettings() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({ minTopup: "", maxTopup: "" })

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await adminAPI.getWalletSettings()
        if (res?.data?.success) setSettings(toForm(res?.data?.data?.walletSettings))
      } catch (e) {
        debugError("Error fetching wallet settings:", e)
        toast.error("Failed to load wallet settings")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const min = Number(settings.minTopup)
  const max = Number(settings.maxTopup)
  const error =
    settings.minTopup === "" || !(min >= 1)
      ? "Minimum must be at least ₹1"
      : settings.maxTopup === "" || !(max >= min)
        ? "Maximum must be at least the minimum"
        : ""

  const handleSave = async () => {
    if (error) {
      toast.error(error)
      return
    }
    try {
      setSaving(true)
      const res = await adminAPI.updateWalletSettings({ minTopup: min, maxTopup: max })
      if (res?.data?.success) {
        setSettings(toForm(res?.data?.data?.walletSettings))
        toast.success("Wallet settings saved")
      } else {
        toast.error(res?.data?.message || "Failed to save wallet settings")
      }
    } catch (e) {
      debugError("Error saving wallet settings:", e)
      toast.error(e?.response?.data?.message || "Failed to save wallet settings")
    } finally {
      setSaving(false)
    }
  }

  const onChange = (key) => (e) => {
    const v = String(e.target.value ?? "")
      .replace(/[^\d]/g, "")
      .replace(/^0+(\d)/, "$1")
    setSettings((prev) => ({ ...prev, [key]: v }))
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Wallet Settings</h1>
        </div>
        <p className="text-sm text-slate-600">
          Limits for customers adding money to their wallet. They apply to both Food and Mart,
          on the website and the app, and the server refuses any top-up outside them.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Add Money Limits</h2>
              <p className="text-sm text-slate-500 mt-1">Changes apply to the next top-up.</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || loading || Boolean(error)}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-xl p-4">
                <label className="block text-sm font-semibold text-slate-900 mb-1">
                  Minimum add money amount (₹)
                </label>
                <input
                  value={settings.minTopup}
                  onChange={onChange("minTopup")}
                  inputMode="numeric"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  placeholder="e.g. 100"
                />
                <p className="text-xs text-slate-500 mt-1">
                  The smallest amount a customer can add in one go.
                </p>
              </div>
              <div className="border border-slate-200 rounded-xl p-4">
                <label className="block text-sm font-semibold text-slate-900 mb-1">
                  Maximum add money amount (₹)
                </label>
                <input
                  value={settings.maxTopup}
                  onChange={onChange("maxTopup")}
                  inputMode="numeric"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  placeholder="e.g. 50000"
                />
                <p className="text-xs text-slate-500 mt-1">
                  The largest amount a customer can add in one go.
                </p>
              </div>
              {error && !loading && (
                <p className="text-sm text-red-600 md:col-span-2">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

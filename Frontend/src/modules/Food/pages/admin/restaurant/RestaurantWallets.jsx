import { useEffect, useMemo, useState } from "react"
import { Loader2, Search, Wallet, AlertTriangle, History, Pencil } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"
import { vt } from "@food/utils/adminVerticalLabels"
import { getCurrentUser } from "@food/utils/auth"
import { isSuperAdmin } from "@food/utils/adminRbac"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@food/components/ui/dialog"

const rupees = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const messageOf = (error, fallback) => error?.response?.data?.message || fallback

/**
 * Every restaurant's wallet exactly as its own app shows it: earned, withdrawn,
 * recorded adjustments and the balance it can withdraw.
 *
 * The balance is worked out from orders and withdrawals; it cannot be typed
 * in. When it is wrong -- a balance carried over from the old system, a
 * dispute -- a super admin records an adjustment here, with the reason. Each
 * one is kept for good; a mistake is undone by recording the opposite amount.
 */
export default function RestaurantWallets() {
  const superAdmin = isSuperAdmin(getCurrentUser("admin"))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.getRestaurantWallets()
      setRows(res?.data?.data?.restaurants || [])
    } catch (error) {
      toast.error(messageOf(error, "Could not load wallets."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? rows.filter((r) => r.restaurantName.toLowerCase().includes(q)) : rows
  }, [rows, query])

  const overpaid = rows.filter((r) => r.overpaidBy > 0)

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{vt("Seller Wallet")}s</h1>
          <p className="mt-1 text-sm text-slate-500">
            {vt("Each seller's balance as their app shows it. Commission only; no subscription is deducted.")}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={vt("Search sellers...")}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {overpaid.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {overpaid.length === 1 ? "1 wallet shows" : `${overpaid.length} wallets show`} more paid out than the records show earned, so
            the balance is ₹0: {overpaid.map((r) => `${r.restaurantName} (${rupees(r.overpaidBy)})`).join(", ")}. If they are owed money,
            {superAdmin ? " record an adjustment with the reason." : " ask a super admin to record an adjustment."}
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">{vt("Seller")}</th>
              <th className="px-4 py-3 text-right">Delivered</th>
              <th className="px-4 py-3 text-right">Earned</th>
              <th className="px-4 py-3 text-right">Withdrawn</th>
              <th className="px-4 py-3 text-right">Adjustments</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">No wallets match.</td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.restaurantId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.restaurantName}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{r.deliveredOrders}</td>
                  <td className="px-4 py-3 text-right">{rupees(r.totalEarnings)}</td>
                  <td className="px-4 py-3 text-right">{rupees(r.totalWithdrawn)}</td>
                  <td className={`px-4 py-3 text-right ${r.totalAdjustments ? "text-blue-700" : "text-slate-400"}`}>
                    {r.totalAdjustments ? rupees(r.totalAdjustments) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {superAdmin ? (
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        title="Edit balance"
                        className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        {rupees(r.balance)}
                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    ) : (
                      rupees(r.balance)
                    )}
                    {r.overpaidBy > 0 && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        overpaid {rupees(r.overpaidBy)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {superAdmin ? <Wallet className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
                      {superAdmin ? "Adjust" : "History"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <EditBalanceDialog
        restaurant={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
        }}
      />

      <AdjustmentDialog
        restaurant={selected}
        canAdjust={superAdmin}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null)
          load()
        }}
      />
    </div>
  )
}

/**
 * Sets a wallet to an exact amount. The server records the difference as an
 * adjustment with the reason, so the history shows who changed it and why.
 */
function EditBalanceDialog({ restaurant, onClose, onSaved }) {
  const [balance, setBalance] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!restaurant) return
    setBalance(String(restaurant.balance ?? 0))
    setReason("")
    setError("")
  }, [restaurant])

  const target = Number(balance)
  const current = Number(restaurant?.rawBalance ?? restaurant?.balance ?? 0)
  const difference = Number.isFinite(target) ? Math.round((target - current) * 100) / 100 : 0
  const valid = balance !== "" && Number.isFinite(target) && target >= 0 && reason.trim().length >= 5

  const save = async (e) => {
    e.preventDefault()
    if (!valid) {
      setError("Enter a balance of zero or more, and a reason of at least 5 characters.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await adminAPI.setRestaurantWalletBalance(restaurant.restaurantId, { balance: target, reason: reason.trim() })
      toast.success(res?.data?.message === "The balance is already that amount." ? "Balance was already that amount" : `${restaurant.restaurantName}: balance set to ${rupees(target)}`)
      onSaved()
    } catch (err) {
      setError(messageOf(err, "Could not update the balance."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!restaurant} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit balance: {restaurant?.restaurantName}</DialogTitle>
        </DialogHeader>
        {restaurant && (
          <form onSubmit={save} className="space-y-3">
            <p className="text-sm text-slate-600">
              Current balance <strong className="tabular-nums">{rupees(restaurant.balance)}</strong>
              {restaurant.overpaidBy > 0 && (
                <span className="text-amber-700"> (paid out {rupees(restaurant.overpaidBy)} beyond earnings)</span>
              )}
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">New balance (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Reason (kept on record, at least 5 characters)</label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Past payouts settled with the restaurant"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {Number.isFinite(target) && balance !== "" && Math.abs(difference) >= 0.01 && (
              <p className="text-xs text-slate-600">
                Records an adjustment of{" "}
                <strong className={`tabular-nums ${difference < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {difference < 0 ? "− " : "+ "}{rupees(Math.abs(difference))}
                </strong>
                . New orders then add to {rupees(target)} as usual, after commission.
              </p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <DialogFooter>
              <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save balance
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AdjustmentDialog({ restaurant, canAdjust, onClose, onSaved }) {
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!restaurant) return
    setAmount("")
    setReason("")
    setError("")
    setLoadingHistory(true)
    adminAPI
      .getRestaurantWalletAdjustments(restaurant.restaurantId)
      .then((res) => setHistory(res?.data?.data?.adjustments || []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false))
  }, [restaurant])

  const value = Number(amount)
  const valid = Number.isFinite(value) && value !== 0 && reason.trim().length >= 5
  const newBalance = restaurant
    ? Math.max(0, restaurant.totalEarnings - restaurant.totalWithdrawn + restaurant.totalAdjustments + (Number.isFinite(value) ? value : 0))
    : 0

  const save = async (e) => {
    e.preventDefault()
    if (!valid) {
      setError("Enter a non-zero amount and a reason of at least 5 characters.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await adminAPI.createRestaurantWalletAdjustment(restaurant.restaurantId, { amount: value, reason: reason.trim() })
      toast.success(`Adjustment of ${rupees(value)} recorded for ${restaurant.restaurantName}`)
      onSaved()
    } catch (err) {
      setError(messageOf(err, "Could not record the adjustment."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!restaurant} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{restaurant?.restaurantName}: wallet</DialogTitle>
        </DialogHeader>

        {restaurant && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm tabular-nums">
            <dt className="text-slate-500">Earned</dt><dd className="text-right">{rupees(restaurant.totalEarnings)}</dd>
            <dt className="text-slate-500">Withdrawn</dt><dd className="text-right">− {rupees(restaurant.totalWithdrawn)}</dd>
            <dt className="text-slate-500">Adjustments</dt><dd className="text-right">{rupees(restaurant.totalAdjustments)}</dd>
            <dt className="font-semibold">Balance now</dt><dd className="text-right font-semibold">{rupees(restaurant.balance)}</dd>
          </dl>
        )}

        {canAdjust && (
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Amount (₹): positive to credit, negative to debit</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 352.75 or -100"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Reason (kept on record, at least 5 characters)</label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Opening balance carried over from the old system"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {Number.isFinite(value) && value !== 0 && (
              <p className="text-xs text-slate-600">Balance after this: <strong className="tabular-nums">{rupees(newBalance)}</strong></p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <DialogFooter>
              <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Record adjustment
              </button>
            </DialogFooter>
          </form>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</p>
          {loadingHistory ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500">No adjustments yet.</p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
              {history.map((a) => (
                <li key={a._id} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex justify-between gap-2">
                    <span className={`font-semibold tabular-nums ${a.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {a.amount < 0 ? "− " : "+ "}{rupees(Math.abs(a.amount))}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {a.createdBy?.name ? ` · ${a.createdBy.name}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-700">{a.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

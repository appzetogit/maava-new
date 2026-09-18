import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, Wallet, ShieldCheck, ShieldX, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const PAGE_SIZE = 20

/**
 * Admin → CUSTOMER MANAGEMENT → COD Access.
 *
 * Turns Cash on Delivery on or off for one customer at a time. The flag lives
 * on the shared `food_users` row, so a change here applies to BOTH the Food app
 * and Maava Mart — there is no per-vertical COD setting to keep in sync.
 *
 * The switch is only the customer-facing half: the server re-checks it when the
 * order is placed, so an older app build cannot pay cash after being blocked.
 */
export default function CodAccess() {
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [codFilter, setCodFilter] = useState("all") // all | enabled | disabled
  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  // Debounced search, so typing a phone number is one request rather than ten.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim())
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminAPI.getCustomers({
        page,
        limit: PAGE_SIZE,
        ...(searchQuery ? { search: searchQuery } : {}),
      })
      const data = response?.data?.data || response?.data
      const list = data?.customers || data?.users || []
      setCustomers(Array.isArray(list) ? list : [])
      setTotal(Number(data?.total) || (Array.isArray(list) ? list.length : 0))
    } catch (error) {
      toast.error("Failed to load customers")
      setCustomers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery])

  useEffect(() => {
    load()
  }, [load])

  // COD state is filtered client-side: the customers endpoint has no codEnabled
  // filter, and adding one would mean paging server-side on a field the list
  // query does not index for this screen.
  const visible = useMemo(() => {
    if (codFilter === "all") return customers
    const wantEnabled = codFilter === "enabled"
    return customers.filter((c) => (c?.codEnabled !== false) === wantEnabled)
  }, [customers, codFilter])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const toggleCod = async (customer) => {
    const id = customer?._id || customer?.id
    if (!id) return
    const next = customer?.codEnabled === false // currently off → turn on
    setSavingId(id)
    // Optimistic: the row flips at once and rolls back if the call fails.
    setCustomers((prev) =>
      prev.map((c) => ((c._id || c.id) === id ? { ...c, codEnabled: next } : c)),
    )
    try {
      await adminAPI.updateCustomerCodAccess(id, next)
      toast.success(
        next
          ? `COD enabled for ${customer?.name || "customer"}`
          : `COD disabled for ${customer?.name || "customer"}`,
      )
    } catch (error) {
      setCustomers((prev) =>
        prev.map((c) => ((c._id || c.id) === id ? { ...c, codEnabled: !next } : c)),
      )
      toast.error(error?.response?.data?.message || "Could not update COD access")
    } finally {
      setSavingId(null)
    }
  }

  const disabledCount = customers.filter((c) => c?.codEnabled === false).length

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-purple-600" />
            COD Access
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Allow or block Cash on Delivery per customer. Applies to both Maava Food and Maava Mart.
          </p>
        </div>
        {disabledCount > 0 && (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-200 self-start">
            {disabledCount} blocked on this page
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, email or phone"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
        </div>
        <select
          value={codFilter}
          onChange={(e) => setCodFilter(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
        >
          <option value="all">All customers</option>
          <option value="enabled">COD enabled</option>
          <option value="disabled">COD disabled</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Customer</th>
                <th className="text-left font-semibold px-4 py-3">Phone</th>
                <th className="text-left font-semibold px-4 py-3">COD status</th>
                <th className="text-right font-semibold px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Loading customers…
                  </td>
                </tr>
              )}

              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                    No customers match this filter.
                  </td>
                </tr>
              )}

              {!loading &&
                visible.map((c) => {
                  const id = c._id || c.id
                  const enabled = c?.codEnabled !== false
                  return (
                    <tr key={id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{c?.name || "—"}</div>
                        <div className="text-xs text-gray-500">{c?.email || ""}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {c?.countryCode ? `${c.countryCode} ` : ""}
                        {c?.phone || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {enabled ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            COD allowed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                            <ShieldX className="w-3.5 h-3.5" />
                            Online payment only
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleCod(c)}
                          disabled={savingId === id}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                            enabled
                              ? "border-red-200 text-red-700 hover:bg-red-50"
                              : "border-green-200 text-green-700 hover:bg-green-50"
                          }`}
                        >
                          {savingId === id
                            ? "Saving…"
                            : enabled
                              ? "Disable COD"
                              : "Enable COD"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages} · {total} customers
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-md border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded-md border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

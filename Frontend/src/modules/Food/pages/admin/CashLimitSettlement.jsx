import { useState, useEffect } from "react"
import { Search, Receipt, Loader2, Package } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const formatCurrency = (amount) => {
  if (amount == null) return "\u20B90.00"
  return `\u20B9${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (d) => {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    })
  } catch {
    return String(d)
  }
}

export default function CashLimitSettlement() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  // Waiting claims first: they are the only rows that need anything doing.
  const [statusFilter, setStatusFilter] = useState("PendingVerification")
  const [review, setReview] = useState(null)
  const [reviewAmount, setReviewAmount] = useState("")
  const [rejectReason, setRejectReason] = useState("")
  const [saving, setSaving] = useState(false)
  const limit = 20

  const fetchData = async (overrides = {}) => {
    const p = overrides.page || page
    try {
      setLoading(true)
      const res = await adminAPI.getCashLimitSettlements({
        search: searchQuery.trim() || undefined,
        status: overrides.status ?? (statusFilter || undefined),
        page: p,
        limit
      })
      if (res?.data?.success) {
        const data = res.data.data
        setTransactions(data?.transactions || [])
        setTotal(data?.pagination?.total || 0)
        setPages(data?.pagination?.pages || 1)
      } else {
        toast.error(res?.data?.message || "Failed to fetch settlements")
        setTransactions([])
      }
    } catch (err) {
      debugError("Error fetching cash limit settlements:", err)
      toast.error(err?.response?.data?.message || "Failed to fetch settlements")
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [page])

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      fetchData({ page: 1 })
    }, 500)
    return () => clearTimeout(t)
  }, [searchQuery])

  const openReview = (tx) => {
    setReview(tx)
    setReviewAmount(String(tx.amount ?? ""))
    setRejectReason("")
  }

  const decide = async (action) => {
    if (!review) return
    if (action === "reject" && !rejectReason.trim()) {
      toast.error("Give a reason so the rider can fix it")
      return
    }
    try {
      setSaving(true)
      const res = await adminAPI.reviewCashSettlement(review.id, {
        action,
        // The admin is reading the real figure off the bank statement, so
        // theirs wins over whatever the rider typed.
        approvedAmount: action === "approve" ? Number(reviewAmount) : undefined,
        reason: action === "reject" ? rejectReason.trim() : undefined
      })
      if (res?.data?.success) {
        toast.success(res.data.message || "Done")
        setReview(null)
        fetchData()
      } else {
        toast.error(res?.data?.message || "Could not save")
      }
    } catch (err) {
      debugError("Error reviewing settlement:", err)
      toast.error(err?.response?.data?.message || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  const statusStyle = (status) => {
    if (status === "Completed") return "bg-green-100 text-green-700"
    if (status === "PendingVerification") return "bg-amber-100 text-amber-800"
    if (status === "Rejected") return "bg-red-100 text-red-700"
    return "bg-slate-100 text-slate-700"
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Cash limit settlement</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Deposit (cash limit settlement) transactions from delivery boys. Amount is added to available limit and deducted from cash in hand.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Transactions</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Claims waiting on someone are what this page is for, so they
                  are the view it opens in. */}
              {[
                { value: "PendingVerification", label: "To verify" },
                { value: "Completed", label: "Approved" },
                { value: "Rejected", label: "Rejected" },
                { value: "", label: "All" },
              ].map((option) => (
                <button
                  key={option.value || "all"}
                  type="button"
                  onClick={() => {
                    setStatusFilter(option.value)
                    setPage(1)
                    fetchData({ page: 1, status: option.value || undefined })
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    statusFilter === option.value
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 sm:flex-initial min-w-[200px] max-w-xs">
              <input
                type="text"
                placeholder="Search by UTR or payment ID"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">#</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Delivery</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">UTR</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Razorpay</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Package className="w-16 h-16 text-slate-400 mb-4" />
                          <p className="text-lg font-semibold text-slate-700">No transactions</p>
                          <p className="text-sm text-slate-500">No cash limit settlement (deposit) transactions yet.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx, i) => (
                      <tr key={tx.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {(page - 1) * limit + i + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                          {formatDate(tx.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {tx.deliveryName || "—"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                          {tx.deliveryIdString || "—"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700 font-mono">
                          {tx.utr || "—"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusStyle(tx.status)}`}>
                            {tx.status === "PendingVerification" ? "Pending verification" : tx.status || "—"}
                          </span>
                          {tx.status === "Rejected" && tx.rejectionReason && (
                            <p className="mt-1 max-w-[220px] text-[11px] text-slate-500">{tx.rejectionReason}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                          {tx.razorpayPaymentId && tx.razorpayPaymentId !== "-"
                            ? tx.razorpayPaymentId.slice(0, 12) + "…"
                            : "—"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {tx.status === "PendingVerification" ? (
                            <button
                              type="button"
                              onClick={() => openReview(tx)}
                              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
                            >
                              Verify
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                Page {page} of {pages} · {total} total
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Verification. The screenshot and the UTR are the whole basis for the
          decision -- a static QR raises no webhook to check against. */}
      {review && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">Verify settlement</h3>
              <button
                type="button"
                onClick={() => setReview(null)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rider</p>
                  <p className="font-medium text-slate-900">{review.deliveryName || "—"}</p>
                  <p className="text-slate-500">{review.deliveryIdString || ""}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Claimed</p>
                  <p className="font-medium text-slate-900">{formatCurrency(review.amount)}</p>
                  <p className="text-slate-500">{formatDate(review.submittedAt || review.createdAt)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">UTR</p>
                <p className="font-mono text-base text-slate-900">{review.utr || "—"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Check this against the company bank account before approving.
                </p>
              </div>

              {review.proofImageUrl ? (
                <a href={review.proofImageUrl} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={review.proofImageUrl}
                    alt="Payment screenshot"
                    className="max-h-72 w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
                  />
                  <span className="mt-1 block text-xs text-slate-500">Open full size</span>
                </a>
              ) : (
                <p className="text-sm text-slate-500">No screenshot attached.</p>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Amount to clear (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={reviewAmount}
                  onChange={(e) => setReviewAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Correct it to whatever actually arrived. Their dues drop by this much.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reason (for rejection)
                </label>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. No transfer found for this UTR"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <p className="mt-1 text-xs text-slate-500">The rider sees this, so make it actionable.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => decide("reject")}
                disabled={saving}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => decide("approve")}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


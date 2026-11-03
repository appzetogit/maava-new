import { Fragment, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Download, Info, Loader2, MapPin, RefreshCw } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { toast } from "sonner"
import { adminAPI } from "@food/api"
import { vt } from "@food/utils/adminVerticalLabels"

const rupees = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const shortRupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`

const messageOf = (error, fallback) => error?.response?.data?.message || fallback

/** Today in India as YYYY-MM-DD, offset by [days]. */
const istDate = (days = 0) => {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000 + days * 86400000)
  return d.toISOString().slice(0, 10)
}

const PRESETS = [
  { key: "today", label: "Today", range: () => [istDate(), istDate()] },
  { key: "7d", label: "Last 7 days", range: () => [istDate(-6), istDate()] },
  { key: "30d", label: "Last 30 days", range: () => [istDate(-29), istDate()] },
  { key: "month", label: "This month", range: () => [`${istDate().slice(0, 8)}01`, istDate()] },
  {
    key: "lastMonth",
    label: "Last month",
    range: () => {
      const [y, m] = istDate().split("-").map(Number)
      const first = new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1))
      const last = new Date(Date.UTC(y, m - 1, 0))
      return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)]
    },
  },
  { key: "custom", label: "Custom" },
]

/** Money columns, in the order the money moves: what came in, then where it went. */
const COLUMNS = [
  { key: "gross", label: "Customer paid" },
  { key: "itemSales", label: vt("Item sales") },
  { key: "deliveryFees", label: "Delivery fees" },
  { key: "platformFees", label: "Platform fees" },
  { key: "commission", label: "Commission" },
  { key: "restaurantPayout", label: vt("Seller payout") },
  { key: "riderPay", label: "Rider pay" },
  { key: "adminEarning", label: "Platform earning" },
]

const selectClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"

function exportCsv(data) {
  const header = ["Zone", vt("Seller"), "Orders", "Cash orders", "Online orders", ...COLUMNS.map((c) => c.label)]
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const lines = [header.map(cell).join(",")]
  for (const z of data.zones) {
    lines.push([z.zoneName, "All", z.orders, z.cashOrders, z.onlineOrders, ...COLUMNS.map((c) => z[c.key])].map(cell).join(","))
    for (const r of z.restaurants) {
      lines.push([z.zoneName, r.restaurantName, r.orders, r.cashOrders, r.onlineOrders, ...COLUMNS.map((c) => r[c.key])].map(cell).join(","))
    }
  }
  const t = data.totals
  lines.push(["Total", "", t.orders, t.cashOrders, t.onlineOrders, ...COLUMNS.map((c) => t[c.key])].map(cell).join(","))
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `zone-earnings_${data.range.from}_to_${data.range.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function Stat({ label, value, hint, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone || "text-slate-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

const earningTone = (n) => (n < 0 ? "text-red-600" : "text-emerald-700")

/**
 * Delivered-order earnings per delivery zone: what customers paid in each
 * zone and how it split between restaurants, riders and the platform.
 *
 * The zone filter is separate from the table on purpose: the table compares
 * zones side by side, the filter narrows every figure on the page (tiles,
 * chart, export) to one zone.
 */
export default function ZoneEarnings() {
  const [preset, setPreset] = useState("30d")
  const [from, setFrom] = useState(istDate(-29))
  const [to, setTo] = useState(istDate())
  const [zoneId, setZoneId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(() => new Set())

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.getZoneEarnings({
        from,
        to,
        ...(zoneId ? { zoneId } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
      })
      setData(res?.data?.data || null)
    } catch (error) {
      toast.error(messageOf(error, "Could not load zone earnings."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (from && to) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, zoneId, paymentMethod])

  const choosePreset = (key) => {
    setPreset(key)
    const p = PRESETS.find((x) => x.key === key)
    if (p?.range) {
      const [f, t] = p.range()
      setFrom(f)
      setTo(t)
    }
  }

  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const totals = data?.totals
  const zones = data?.zones || []
  const zoneLabel = useMemo(
    () => data?.zoneOptions?.find((z) => z.zoneId === zoneId)?.zoneName,
    [data, zoneId],
  )

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <MapPin className="h-6 w-6 text-blue-600" />
            Zone Earnings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {vt("Delivered orders by delivery zone: what customers paid and how it was split between sellers, riders and the platform.")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => data && exportCsv(data)}
            disabled={!data || zones.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Zone</span>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={`${selectClass} min-w-48`}>
            <option value="">All zones</option>
            {(data?.zoneOptions || []).map((z) => (
              <option key={z.zoneId} value={z.zoneId}>
                {z.zoneName}
                {z.isActive === false ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Period</span>
          <select value={preset} onChange={(e) => choosePreset(e.target.value)} className={selectClass}>
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">From</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setPreset("custom")
              setFrom(e.target.value)
            }}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">To</span>
          <input
            type="date"
            value={to}
            min={from}
            max={istDate()}
            onChange={(e) => {
              setPreset("custom")
              setTo(e.target.value)
            }}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Payment</span>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={selectClass}>
            <option value="">Cash and online</option>
            <option value="cash">Cash on delivery</option>
            <option value="online">Paid online</option>
          </select>
        </label>
        {(zoneId || paymentMethod) && (
          <button
            type="button"
            onClick={() => {
              setZoneId("")
              setPaymentMethod("")
            }}
            className="pb-2 text-sm font-medium text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading zone earnings…
        </div>
      ) : !totals ? null : (
        <>
          <p className="text-sm text-slate-600">
            {zoneLabel ? <strong className="text-slate-900">{zoneLabel}</strong> : "All zones"} ·{" "}
            {data.range.from === data.range.to ? data.range.from : `${data.range.from} to ${data.range.to}`}
            {paymentMethod === "cash" && " · cash on delivery"}
            {paymentMethod === "online" && " · paid online"}
          </p>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Delivered orders"
              value={totals.orders.toLocaleString("en-IN")}
              hint={`${totals.cashOrders} cash · ${totals.onlineOrders} online`}
            />
            <Stat label="Customer paid" value={rupees(totals.gross)} hint={`Cash ${shortRupees(totals.cashGross)} · Online ${shortRupees(totals.onlineGross)}`} />
            <Stat label="Commission" value={rupees(totals.commission)} hint={`Platform fees ${shortRupees(totals.platformFees)}`} />
            <Stat label={vt("Seller payout")} value={rupees(totals.restaurantPayout)} hint={`Item sales ${shortRupees(totals.itemSales)}`} />
            <Stat label="Rider pay" value={rupees(totals.riderPay)} hint={`Delivery fees ${shortRupees(totals.deliveryFees)}`} />
            <Stat
              label="Platform earning"
              value={rupees(totals.adminEarning)}
              tone={earningTone(totals.adminEarning)}
              hint={totals.adminEarning < 0 ? "Rider pay and discounts exceeded income" : "What Maava keeps"}
            />
          </div>

          {/* Trend */}
          {data.series.length > 1 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Daily trend</h2>
                <div className="flex gap-4 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> Customer paid
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Platform earning
                  </span>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={data.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="zeGross" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tickFormatter={shortRupees} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
                    <Tooltip
                      formatter={(v, name) => [rupees(v), name === "gross" ? "Customer paid" : "Platform earning"]}
                      labelFormatter={(d, payload) => `${d} · ${payload?.[0]?.payload?.orders ?? 0} orders`}
                    />
                    <Area type="monotone" dataKey="gross" stroke="#3b82f6" strokeWidth={2} fill="url(#zeGross)" />
                    <Area type="monotone" dataKey="adminEarning" stroke="#10b981" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Zones */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">By zone</h2>
              <p className="text-xs text-slate-500">{vt("Click a zone to see its sellers")}</p>
            </div>
            {zones.length === 0 ? (
              <p className="px-4 py-16 text-center text-sm text-slate-500">No delivered orders for these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Zone</th>
                      <th className="px-3 py-3 text-right">Orders</th>
                      {COLUMNS.map((c) => (
                        <th key={c.key} className="px-3 py-3 text-right">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {zones.map((z) => {
                      const isOpen = open.has(z.zoneId)
                      return (
                        <Fragment key={z.zoneId}>
                          <tr className="cursor-pointer hover:bg-slate-50" onClick={() => toggle(z.zoneId)}>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              <span className="flex items-center gap-1.5">
                                {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                                {z.zoneName}
                                {z.isActive === false && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Inactive</span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="font-medium text-slate-900">{z.orders}</span>
                              <span className="block text-[11px] text-slate-500">
                                {z.cashOrders} cash · {z.onlineOrders} online
                              </span>
                            </td>
                            {COLUMNS.map((c) => (
                              <td
                                key={c.key}
                                className={`px-3 py-3 text-right ${c.key === "adminEarning" ? `font-semibold ${earningTone(z[c.key])}` : c.key === "gross" ? "font-semibold text-slate-900" : "text-slate-700"}`}
                              >
                                {rupees(z[c.key])}
                              </td>
                            ))}
                          </tr>
                          {isOpen &&
                            z.restaurants.map((r) => (
                              <tr key={`${z.zoneId}-${r.restaurantId}`} className="bg-slate-50/60 text-[13px]">
                                <td className="py-2 pl-11 pr-4 text-slate-700">{r.restaurantName}</td>
                                <td className="px-3 py-2 text-right text-slate-700">{r.orders}</td>
                                {COLUMNS.map((c) => (
                                  <td key={c.key} className={`px-3 py-2 text-right ${c.key === "adminEarning" ? earningTone(r[c.key]) : "text-slate-600"}`}>
                                    {rupees(r[c.key])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                  {zones.length > 1 && (
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold tabular-nums">
                      <tr>
                        <td className="px-4 py-3 text-slate-900">Total</td>
                        <td className="px-3 py-3 text-right text-slate-900">{totals.orders}</td>
                        {COLUMNS.map((c) => (
                          <td key={c.key} className={`px-3 py-3 text-right ${c.key === "adminEarning" ? earningTone(totals[c.key]) : "text-slate-900"}`}>
                            {rupees(totals[c.key])}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              {vt("Delivered orders only, by order date (India time). An order counts in the zone it was placed in; older orders with no zone use the zone their seller sits in on the map. Platform earning is commission plus platform and delivery fees, less rider pay and the discounts Maava pays for.")}
              {totals.estimatedOrders > 0 &&
                ` ${totals.estimatedOrders} older order${totals.estimatedOrders === 1 ? " has" : "s have"} no settlement record, so ${totals.estimatedOrders === 1 ? "its" : "their"} split is worked out from the bill, with rider pay taken as the delivery charge.`}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

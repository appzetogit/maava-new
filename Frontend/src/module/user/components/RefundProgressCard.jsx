import { useEffect, useState } from "react"
import { CheckCircle2, Circle, AlertTriangle, Wallet } from "lucide-react"
import { orderAPI } from "@/lib/api"

const formatWhen = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

/**
 * Where a cancelled order's money is: started, sent to the bank, expected by.
 *
 * Fetches the order itself, so it works whichever way the tracking page built
 * its own copy, and renders nothing for an order with no refund.
 */
export default function RefundProgressCard({ orderId, refreshKey }) {
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    if (!orderId) return undefined
    let cancelled = false
    orderAPI
      .getOrderDetails(orderId)
      .then((res) => {
        if (!cancelled) setProgress(res?.data?.data?.order?.refundProgress || null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [orderId, refreshKey])

  if (!progress) return null

  const failed = progress.state === "failed"
  const toWallet = progress.destination === "wallet"

  return (
    <section
      aria-label="Refund status"
      className={`rounded-xl border p-4 bg-white dark:bg-[#1a1a1a] ${
        failed ? "border-amber-300 dark:border-amber-700" : "border-emerald-200 dark:border-emerald-900"
      }`}
    >
      <div className="flex items-start gap-3">
        {failed ? (
          <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-600 shrink-0" />
        ) : toWallet ? (
          <Wallet className="w-5 h-5 mt-0.5 text-emerald-600 shrink-0" />
        ) : (
          <CheckCircle2 className="w-5 h-5 mt-0.5 text-emerald-600 shrink-0" />
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{progress.title}</h3>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{progress.message}</p>
        </div>
      </div>

      {Array.isArray(progress.steps) && progress.steps.length > 1 && (
        <ol className="mt-4 ml-1 space-y-0">
          {progress.steps.map((step, i) => {
            const last = i === progress.steps.length - 1
            return (
              <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
                {!last && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[9px] top-5 bottom-0 w-0.5 ${
                      step.done && progress.steps[i + 1]?.done ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  />
                )}
                {step.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 relative" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600 shrink-0 relative" />
                )}
                <div className="flex-1 flex items-baseline justify-between gap-2">
                  <span
                    className={`text-sm ${
                      step.done ? "text-gray-900 dark:text-white font-medium" : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
                    {step.done ? formatWhen(step.at) : step.note || ""}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {progress.arn && (
        <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
          Bank reference (ARN): <span className="font-mono text-gray-900 dark:text-white select-all">{progress.arn}</span>
        </p>
      )}
    </section>
  )
}

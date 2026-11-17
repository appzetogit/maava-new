import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"

/**
 * TopToast: slate pill from the top, coloured icon disc, 2s by default.
 *
 *   import { toast } from "@/module/user/design"
 *   toast.success("Added to cart")
 *
 * BrandProvider mounts the viewport, so toasts inherit the `.mv` tokens.
 */
const listeners = new Set()
let seq = 0

function push(type, message, { duration = 2000 } = {}) {
  const item = { id: ++seq, type, message, duration }
  listeners.forEach((fn) => fn(item))
  return item.id
}

export const toast = {
  success: (message, opts) => push("success", message, opts),
  error: (message, opts) => push("error", message, opts),
  warning: (message, opts) => push("warning", message, opts),
  info: (message, opts) => push("info", message, opts),
}

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }

export function ToastViewport() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const add = (item) => {
      setItems((list) => [...list.slice(-2), item])
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== item.id)), item.duration)
    }
    listeners.add(add)
    return () => listeners.delete(add)
  }, [])

  return (
    <div className="mv-toasts" role="region" aria-live="polite" aria-label="Notifications">
      {items.map((t) => {
        const Icon = ICONS[t.type] || Info
        return (
          <div key={t.id} className={`mv-toast mv-toast--${t.type}`} role={t.type === "error" ? "alert" : "status"}>
            <span className="mv-toast__icon">
              <Icon aria-hidden="true" />
            </span>
            <span>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}

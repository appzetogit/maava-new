import { useEffect, useMemo } from "react"
import { useLocation } from "react-router-dom"
import { Eye } from "lucide-react"
import { getCurrentUser } from "@food/utils/auth"
import { accessKeyForPath } from "@food/utils/adminAccess"
import { getAdminAccess, isSuperAdmin } from "@food/utils/adminRbac"

// On a page a sub-admin has View (not Edit) on, hide whatever changes data --
// Add / Save / Delete / Approve buttons, pencil and trash icons, toggles, file
// pickers -- including inside dialogs. Done here once rather than in every
// page. The server refuses edits anyway; this keeps the page honest.

const ACTION_WORDS =
  /\b(add|create|new|save|update|edit|delete|remove|approve|reject|accept|refund|upload|import|publish|submit|assign|credit|settle|mark|block|unblock|enable|disable|activate|deactivate|reset|send|apply|confirm|bulk|duplicate|restore|reorder|change)\b/i
const LINK_WORDS = /\b(add|create|edit|new)\b/i
const ACTION_ICONS = /lucide-(trash|pencil|square-pen|pen-|edit|plus|upload|check\b|circle-check|save)/
const HIDDEN = "data-view-only-hidden"

function isChrome(el) {
  return Boolean(el.closest("[data-admin-chrome]"))
}

function textOf(el) {
  return String(el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim()
}

function sweep() {
  const candidates = document.querySelectorAll(
    'button, [role="button"], a[href], input[type="submit"], input[type="file"], [role="switch"], [role="menuitem"]'
  )
  for (const el of candidates) {
    if (el.hasAttribute(HIDDEN) || isChrome(el)) continue
    const tag = el.tagName
    const role = el.getAttribute("role")
    let block = false

    if (role === "switch" || (tag === "INPUT" && el.type === "file")) {
      el.setAttribute(HIDDEN, "disabled")
      el.setAttribute("disabled", "")
      el.style.pointerEvents = "none"
      el.style.opacity = "0.5"
      continue
    }

    const text = textOf(el)
    if (tag === "A") {
      block = LINK_WORDS.test(text)
    } else {
      const svg = el.querySelector("svg")
      const iconOnly = svg && text.length === 0
      block = ACTION_WORDS.test(text) || (iconOnly && ACTION_ICONS.test(String(svg.getAttribute("class") || "")))
      if (!block && svg && ACTION_ICONS.test(String(svg.getAttribute("class") || "")) && /^(\+|)$/.test(text)) block = true
    }
    if (block) {
      el.setAttribute(HIDDEN, "hidden")
      el.style.display = "none"
    }
  }
}

function restore() {
  for (const el of document.querySelectorAll(`[${HIDDEN}]`)) {
    if (el.getAttribute(HIDDEN) === "disabled") {
      el.removeAttribute("disabled")
      el.style.pointerEvents = ""
      el.style.opacity = ""
    } else {
      el.style.display = ""
    }
    el.removeAttribute(HIDDEN)
  }
}

export function useIsViewOnlyPage() {
  const { pathname } = useLocation()
  return useMemo(() => {
    const admin = getCurrentUser("admin")
    if (!admin || isSuperAdmin(admin)) return false
    const key = accessKeyForPath(pathname)
    if (!key || key === "open" || key === "super") return false
    return getAdminAccess(admin)[key] === "view"
  }, [pathname])
}

export default function ViewOnlyGuard() {
  const viewOnly = useIsViewOnlyPage()

  useEffect(() => {
    if (!viewOnly) return undefined
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        sweep()
      })
    }
    sweep()
    // Pages load data and open dialogs after mounting; catch those too.
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      restore()
    }
  }, [viewOnly])

  if (!viewOnly) return null
  return (
    <div className="w-full bg-sky-50 border-b border-sky-200 px-4 py-2 text-sm text-sky-900 flex items-center gap-2">
      <Eye className="w-4 h-4 shrink-0" />
      View only — you can look but not change anything here. Ask a super admin for edit access.
    </div>
  )
}

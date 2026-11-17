/**
 * Which customer shell to show: the app-style one ("next") or the old site.
 *
 *   (default)       the new, app-style shell
 *   ?shell=classic  go back to the old site in this browser (remembered)
 *   ?shell=next     return to the new shell (remembered)
 *
 * The new shell is the default for everyone; the classic site stays reachable
 * with ?shell=classic as an escape hatch while the last screens are rebuilt.
 */
const KEY = "mv.shell"

export function readShellChoice(search = typeof window !== "undefined" ? window.location.search : "") {
  try {
    const requested = new URLSearchParams(search).get("shell")
    if (requested === "next" || requested === "classic") {
      window.localStorage.setItem(KEY, requested)
      return requested
    }
    return window.localStorage.getItem(KEY) === "classic" ? "classic" : "next"
  } catch {
    return "next"
  }
}

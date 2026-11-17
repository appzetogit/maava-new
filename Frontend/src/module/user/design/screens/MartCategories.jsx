import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LayoutGrid } from "lucide-react"
import { getNavCategories } from "@/lib/api/inmartAPI"
import { AppBar, Button, EmptyState, SkeletonBox, SmartImage } from "../index"
import "./screens.css"

/**
 * Mart -> Categories tab (quick/ui/screens/category/categories).
 *
 * The website had no page for this tab: Mart categories only appeared inside
 * the Mart home. Every root category is a section and its sub-categories are
 * tiles that open the same product listing the Mart home links to. A root with
 * no sub-categories is a tile of its own, so nothing is unreachable.
 */
export default function MartCategories() {
  const navigate = useNavigate()
  const [state, setState] = useState({ status: "loading", categories: [] })

  const load = useCallback(() => {
    let alive = true
    setState((s) => ({ ...s, status: "loading" }))
    getNavCategories()
      .then((res) => {
        if (!alive) return
        const list = (res?.data?.navigation || []).filter((c) => c.isActive !== false)
        setState({ status: "ready", categories: list })
      })
      .catch(() => {
        if (alive) setState({ status: "error", categories: [] })
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => load(), [load])

  const open = (cat) => navigate(`/food/user/in-mart/products/${encodeURIComponent(cat.slug || cat.id)}`)

  return (
    <div className="mv-screen">
      <AppBar title="Categories" />

      {state.status === "loading" && (
        <section className="mv-cat-section" role="status" aria-label="Loading categories">
          <SkeletonBox width={120} height={16} radius={4} />
          <div className="mv-cat-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="mv-cat-tile">
                <SkeletonBox height={0} radius={16} style={{ width: "100%", aspectRatio: "1" }} />
                <SkeletonBox width={52} height={10} radius={4} />
              </div>
            ))}
          </div>
        </section>
      )}

      {state.status !== "loading" && state.categories.length === 0 && (
        <EmptyState
          icon={LayoutGrid}
          title={state.status === "error" ? "Categories didn't load" : "No categories yet"}
          subtitle={state.status === "error" ? "Check your connection and try again." : "Categories appear here once the store adds them."}
          action={
            state.status === "error" && (
              <Button size="md" block={false} onClick={load}>
                Try again
              </Button>
            )
          }
        />
      )}

      {state.status === "ready" &&
        state.categories.map((root) => {
          const tiles = root.subCategories?.length ? root.subCategories : [root]
          return (
            <section key={root.id} className="mv-cat-section" aria-labelledby={`mv-cat-${root.id}`}>
              <h2 id={`mv-cat-${root.id}`} className="mv-title-medium">
                {root.name}
              </h2>
              <div className="mv-cat-grid">
                {tiles.map((sub) => (
                  <button key={sub.id} type="button" className="mv-cat-tile" onClick={() => open(sub)}>
                    <SmartImage src={sub.image ?? sub.icon} alt="" category="food" className="mv-cat-tile__img" />
                    <span className="mv-cat-tile__name">{sub.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
    </div>
  )
}

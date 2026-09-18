/**
 * Skeletons from common_widgets/skeleton_loading.dart: #EBEBF4 base with a
 * #F8F8FC sweep (dark: #1E293B / #334155) over 1.5s, same boxes and radii.
 */
export function SkeletonBox({ width = "100%", height = 16, radius = 8, style }) {
  return <span className="mv-skel" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />
}

export function SkeletonRestaurantCard() {
  return (
    <div className="mv-skel-card" aria-hidden="true">
      <SkeletonBox height={160} radius={16} />
      <div className="mv-skel-row" style={{ marginTop: 6 }}>
        <SkeletonBox width={180} height={18} radius={4} />
        <SkeletonBox width={44} height={18} radius={4} />
      </div>
      <SkeletonBox width={130} height={14} radius={4} />
    </div>
  )
}

export function SkeletonFoodItemCard() {
  return (
    <div className="mv-skel-card" aria-hidden="true" style={{ display: "flex", gap: 16 }}>
      <div style={{ display: "grid", gap: 8, flex: 1, alignContent: "start" }}>
        <SkeletonBox width={20} height={20} radius={4} />
        <SkeletonBox width={160} height={18} radius={4} />
        <SkeletonBox width={70} height={16} radius={4} />
        <SkeletonBox width="90%" height={12} radius={4} />
      </div>
      <SkeletonBox width={110} height={110} radius={16} />
    </div>
  )
}

export function SkeletonBanner({ height = 150 }) {
  return <SkeletonBox height={height} radius={20} />
}

export function SkeletonOrderCard() {
  return (
    <div className="mv-skel-card" aria-hidden="true" style={{ borderRadius: 18 }}>
      <div className="mv-skel-row">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <SkeletonBox width={50} height={50} radius={12} />
          <div style={{ display: "grid", gap: 6 }}>
            <SkeletonBox width={140} height={16} radius={4} />
            <SkeletonBox width={100} height={12} radius={4} />
          </div>
        </div>
        <SkeletonBox width={60} height={22} radius={12} />
      </div>
    </div>
  )
}

/** Announces loading once for screen readers while the skeletons are visual-only. */
export function SkeletonList({ count = 3, item: Item = SkeletonRestaurantCard, label = "Loading" }) {
  return (
    <div role="status" aria-label={label} style={{ display: "grid", gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <Item key={i} />
      ))}
    </div>
  )
}

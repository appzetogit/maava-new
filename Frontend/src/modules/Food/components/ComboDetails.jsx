import { describeCombo } from "../utils/comboItems"

/**
 * The combo label and contents on a menu card. The contents are skipped when
 * the description already says the same thing, which it does unless the
 * restaurant wrote its own.
 */
export default function ComboDetails({ item }) {
  if (!item?.isCombo) return null
  const contents = describeCombo(item.comboItems)
  return (
    <div className="mt-1">
      <span className="inline-block rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
        Combo
      </span>
      {contents && contents !== item.description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{contents}</p>
      )}
    </div>
  )
}

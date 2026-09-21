import { ADMIN_ACCESS_GROUPS } from "@food/utils/adminAccess"

// The sidebar options, grouped as in the sidebar, each with a View and an
// Edit box. Edit includes view; clearing View clears Edit.
// value: { key: "view" | "edit" }
export default function AccessPicker({ value = {}, onChange }) {
  const set = (key, level) => {
    const next = { ...value }
    if (level) next[key] = level
    else delete next[key]
    onChange(next)
  }

  const setGroup = (items, level) => {
    const next = { ...value }
    for (const item of items) {
      if (level) next[item.key] = level
      else delete next[item.key]
    }
    onChange(next)
  }

  const count = Object.keys(value).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {count === 0 ? "No sidebar options selected yet." : `${count} sidebar option${count === 1 ? "" : "s"} selected.`}
        </p>
        <div className="flex gap-2 text-xs">
          <button type="button" className="px-2 py-1 border rounded" onClick={() => setGroup(ADMIN_ACCESS_GROUPS.flatMap((g) => g.items), "view")}>View all</button>
          <button type="button" className="px-2 py-1 border rounded" onClick={() => setGroup(ADMIN_ACCESS_GROUPS.flatMap((g) => g.items), "edit")}>Edit all</button>
          <button type="button" className="px-2 py-1 border rounded" onClick={() => onChange({})}>Clear</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {ADMIN_ACCESS_GROUPS.map(({ group, items }) => {
          const allView = items.every((i) => value[i.key])
          const allEdit = items.every((i) => value[i.key] === "edit")
          return (
            <fieldset key={group} className="border border-slate-200 rounded-lg">
              <legend className="sr-only">{group}</legend>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 rounded-t-lg">
                <span className="text-sm font-semibold text-slate-800">{group}</span>
                <div className="flex gap-4 text-xs text-slate-600">
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={allView} onChange={(e) => setGroup(items, e.target.checked ? "view" : null)} /> View
                  </label>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={allEdit} onChange={(e) => setGroup(items, e.target.checked ? "edit" : "view")} /> Edit
                  </label>
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const level = value[item.key]
                  return (
                    <li key={item.key} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-sm text-slate-700">{item.label}</span>
                      <div className="flex gap-4 text-xs text-slate-600 shrink-0">
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={Boolean(level)} onChange={(e) => set(item.key, e.target.checked ? "view" : null)} /> View
                        </label>
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={level === "edit"} onChange={(e) => set(item.key, e.target.checked ? "edit" : "view")} /> Edit
                        </label>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          )
        })}
      </div>
      <p className="text-xs text-slate-500">
        View shows the page. Edit also allows adding, changing and deleting on it. Only super admins can manage other admins.
      </p>
    </div>
  )
}

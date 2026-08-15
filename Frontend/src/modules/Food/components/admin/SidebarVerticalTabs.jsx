import { Store, ShoppingBasket } from "lucide-react";
import {
  ADMIN_VERTICALS,
  getAdminVertical,
  setAdminVertical,
} from "@food/utils/adminVertical";

const ICONS = { food: Store, quick: ShoppingBasket };

/**
 * Switches the whole admin panel between the food and quick-commerce
 * catalogues, as a pair of tabs at the top of the sidebar.
 *
 * Selecting a vertical reloads the page. That is blunt and it is the honest
 * option: roughly 170 admin screens hold server data in their own component
 * state, fetched on mount. Switching in place would leave every mounted list
 * showing the previous vertical's rows under a header naming the new one, with
 * no way to tell which is true. A reload cannot be half-applied.
 *
 * ponytail: swap the reload for cache invalidation if those screens ever share
 * a query client. Worth doing only when all of them are covered, never one at
 * a time.
 */
export default function SidebarVerticalTabs({ isCollapsed = false }) {
  const current = getAdminVertical();

  const choose = (value) => {
    if (value === current) return;
    setAdminVertical(value);
    window.location.reload();
  };

  if (isCollapsed) {
    // Collapsed rail: icons only, stacked, still showing which is active.
    return (
      <div className="px-2 pb-2 flex flex-col gap-1" role="tablist" aria-label="Vertical">
        {ADMIN_VERTICALS.map((entry) => {
          const Icon = ICONS[entry.value] || Store;
          const active = entry.value === current;
          return (
            <button
              key={entry.value}
              type="button"
              role="tab"
              aria-selected={active}
              title={entry.label}
              onClick={() => choose(entry.value)}
              className={`h-9 w-full rounded-lg flex items-center justify-center transition-colors ${
                active
                  ? "bg-white/15 text-white ring-1 ring-white/20"
                  : "text-neutral-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <div
        role="tablist"
        aria-label="Vertical"
        className="flex items-center gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10"
      >
        {ADMIN_VERTICALS.map((entry) => {
          const Icon = ICONS[entry.value] || Store;
          const active = entry.value === current;
          return (
            <button
              key={entry.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => choose(entry.value)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {entry.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Store, ShoppingBasket, ChevronDown } from "lucide-react";
import {
  ADMIN_VERTICALS,
  getAdminVertical,
  setAdminVertical,
} from "@food/utils/adminVertical";

const ICONS = { food: Store, quick: ShoppingBasket };

/**
 * Switches the whole admin panel between the food and quick-commerce
 * catalogues.
 *
 * Selecting a vertical reloads the page rather than re-rendering in place.
 *
 * That is blunt, and it is the honest option: roughly 170 admin screens hold
 * server data in their own component state, fetched on mount. Switching without
 * a reload would leave every already-mounted list showing the previous
 * vertical's rows until something happened to refetch it -- an admin looking at
 * restaurant orders under a header that says Quick Commerce, with no way to tell
 * which is true. A reload is a fraction of a second and cannot be half-applied.
 *
 * ponytail: swap the reload for cache invalidation if these screens ever move
 * onto a shared query client. There is no point doing it for one screen at a
 * time -- the guarantee only holds when all of them are covered.
 */
export default function VerticalSwitcher() {
  const [open, setOpen] = useState(false);
  const current = getAdminVertical();
  const active = ADMIN_VERTICALS.find((entry) => entry.value === current) || ADMIN_VERTICALS[0];
  const ActiveIcon = ICONS[active.value] || Store;

  const choose = (value) => {
    setOpen(false);
    if (value === current) return;
    setAdminVertical(value);
    window.location.reload();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Vertical: ${active.label}. Change vertical`}
        className="flex items-center gap-2 h-11 rounded-full border border-neutral-200 bg-neutral-50 px-3 text-neutral-700 hover:bg-neutral-100 transition-colors"
      >
        <ActiveIcon className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm font-medium hidden sm:inline">{active.short}</span>
        <ChevronDown className="w-4 h-4 text-neutral-400" aria-hidden="true" />
      </button>

      {open && (
        <>
          {/* Click-away. Sits under the menu so the menu stays clickable. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <ul
            role="listbox"
            aria-label="Vertical"
            className="absolute right-0 z-50 mt-2 w-52 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
          >
            {ADMIN_VERTICALS.map((entry) => {
              const Icon = ICONS[entry.value] || Store;
              const selected = entry.value === current;
              return (
                <li key={entry.value} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => choose(entry.value)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? "bg-neutral-100 font-medium text-neutral-900"
                        : "text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    {entry.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  Palette,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { adminAPI, uploadAPI } from "@food/api";
import { getAdminVertical, setAdminVertical } from "@food/utils/adminVertical";

/**
 * The Mart "Housefull Sale" section, end to end.
 *
 * One campaign per header category plus a default for the "All" screen. Each
 * carries everything the app draws: heading, colours, banner image, sale window,
 * the deal card's rotating products, and the offer tiles beside it.
 *
 * Before this page existed the whole section could only be changed by running a
 * seed script on the server, and the app shipped much of it as literals.
 */

const DEFAULT_ROW_ID = "__default__";

const normalizeHex = (value, fallback = "") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const next = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(next) ? next.toUpperCase() : fallback;
};

const hexToRgb = (hex) => {
  const h = String(hex || "").replace("#", "");
  if (!/^[0-9A-Fa-f]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

/** Mirrors the app's own ramp so the preview is the real thing. */
const shiftLightness = (hex, delta) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const nl = Math.min(1, Math.max(0, l + delta));
  const c = (1 - Math.abs(2 * nl - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = nl - c / 2;
  const table = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ];
  const [rr, gg, bb] = table[Math.floor(h / 60) % 6];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(rr)}${to(gg)}${to(bb)}`.toUpperCase();
};

const inkFor = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#FFFFFF";
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 > 0.5
    ? "#1F2937"
    : "#FFFFFF";
};

/** `2026-08-21T…` → `2026-08-21`, which is what a date input wants. */
const toDateInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const move = (list, from, to) => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#FFFFFF"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          placeholder="#RRGGBB — blank keeps the Mart brand colour"
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(normalizeHex(e.target.value, ""))}
          className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="h-10 px-2 text-xs text-slate-500 hover:text-slate-800"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function ImageField({ label, value, onChange, folder }) {
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    try {
      setBusy(true);
      const res = await uploadAPI.uploadMedia(file, { folder });
      const url = (res?.data?.data || res?.data)?.url;
      if (!url) throw new Error("Upload returned no URL");
      onChange(url);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Image upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="flex-1 space-y-1.5">
          <input
            type="text"
            value={value ?? ""}
            placeholder="Paste an image URL, or upload"
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => upload(e.target.files?.[0])}
              className="text-xs"
            />
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
            {value ? (
              <button
                type="button"
                onClick={() => onChange("")}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The offer tiles beside the deal card: add, edit, reorder, remove. */
function TilesEditor({ tiles, categories, onChange }) {
  const patch = (index, next) =>
    onChange(tiles.map((t, i) => (i === index ? { ...t, ...next } : t)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">
          Offer tiles <span className="font-normal text-slate-500">({tiles.length})</span>
        </h3>
        <button
          type="button"
          onClick={() =>
            onChange([...tiles, { title: "", badgeText: "", emojis: "", imageUrl: "", categoryId: "" }])
          }
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add tile
        </button>
      </div>

      {tiles.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          No tiles. The banner shows the heading and deal card only.
        </p>
      ) : null}

      {tiles.map((tile, index) => (
        <div key={index} className="rounded-lg border border-slate-200 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Tile {index + 1}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => onChange(move(tiles, index, index - 1))}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={index === tiles.length - 1}
                onClick={() => onChange(move(tiles, index, index + 1))}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Remove tile"
                onClick={() => onChange(tiles.filter((_, i) => i !== index))}
                className="rounded p-1 text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <TextField
              label="Tile heading"
              value={tile.title}
              placeholder="e.g. Self Care & Wellness"
              onChange={(v) => patch(index, { title: v })}
            />
            <TextField
              label="Discount badge"
              value={tile.badgeText}
              placeholder="e.g. Up to 55% OFF"
              onChange={(v) => patch(index, { badgeText: v })}
            />
            <TextField
              label="Emoji strip (optional)"
              value={tile.emojis}
              placeholder="🧴 💧 🧼 💄"
              onChange={(v) => patch(index, { emojis: v })}
            />
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Opens category
              </label>
              <select
                value={tile.categoryId || ""}
                onChange={(e) => patch(index, { categoryId: e.target.value })}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— not linked —</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ImageField
            label="Tile image (optional)"
            value={tile.imageUrl}
            folder="maava/mart-sale/tiles"
            onChange={(v) => patch(index, { imageUrl: v })}
          />
        </div>
      ))}
    </div>
  );
}

/** The products the deal card rotates through, in the order shown. */
function ProductsEditor({ products, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);

  const search = useCallback((term) => {
    clearTimeout(timer.current);
    // Debounced: the catalogue search runs on every keystroke otherwise.
    timer.current = setTimeout(async () => {
      if (!term.trim()) {
        setResults([]);
        return;
      }
      try {
        setSearching(true);
        const res = await adminAPI.searchMartProducts(term.trim());
        const data = res?.data?.data;
        const rows = Array.isArray(data) ? data : data?.products || data?.items || [];
        setResults(rows.slice(0, 10));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const add = (row) => {
    if (products.some((p) => p.id === String(row._id))) return;
    onChange([
      ...products,
      {
        id: String(row._id),
        name: row.name,
        image: row.image || (row.images || [])[0] || "",
        price: row.price,
        mrp: row.mrp,
      },
    ]);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-slate-800">
        Deal card products{" "}
        <span className="font-normal text-slate-500">
          ({products.length} — the card rotates through these in order)
        </span>
      </h3>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          placeholder="Search the catalogue to add a product…"
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        ) : null}

        {results.length > 0 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
            {results.map((row) => (
              <button
                key={row._id}
                type="button"
                onClick={() => add(row)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <img
                  src={row.image || (row.images || [])[0] || ""}
                  alt=""
                  className="h-8 w-8 rounded object-cover bg-slate-100"
                />
                <span className="flex-1 truncate">{row.name}</span>
                <span className="text-xs text-slate-500">₹{row.price}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {products.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          None selected — the app falls back to its own flash-sale pick.
        </p>
      ) : null}

      <ul className="space-y-2">
        {products.map((p, index) => (
          <li
            key={p.id}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5"
          >
            <span className="w-5 text-center text-xs font-semibold text-slate-400">
              {index + 1}
            </span>
            <img src={p.image} alt="" className="h-9 w-9 rounded object-cover bg-slate-100" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
              <p className="text-xs text-slate-500">
                ₹{p.price}
                {p.mrp && p.mrp > p.price ? (
                  <span className="ml-1 line-through">₹{p.mrp}</span>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => onChange(move(products, index, index - 1))}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={index === products.length - 1}
              onClick={() => onChange(move(products, index, index + 1))}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Remove product"
              onClick={() => onChange(products.filter((_, i) => i !== index))}
              className="rounded p-1 text-red-500 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Preview({ row }) {
  const theme = normalizeHex(row.themeColor, "");
  const accent = normalizeHex(row.accentColor, "") || theme;
  if (!theme) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-center">
        <span className="text-xs text-slate-500">
          No colour set — this screen uses the Mart brand colour
        </span>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div
        className="px-3 py-2.5"
        style={{
          background: `linear-gradient(to bottom, ${shiftLightness(theme, -0.14)}, ${theme}, ${shiftLightness(theme, 0.08)})`,
          color: inkFor(theme),
        }}
      >
        <div className="text-[10px] opacity-80">MAAVA Quick Commerce</div>
        <div className="text-sm font-bold truncate">{row.label}</div>
        <div className="mt-1.5 rounded bg-white/90 px-2 py-1 text-[10px] text-slate-500">
          {row.searchHint ? `Search "${row.searchHint}"` : "Search…"}
        </div>
      </div>
      <div
        className="px-3 py-2.5 text-center"
        style={{
          background: `linear-gradient(to bottom, ${shiftLightness(accent, -0.34)}, ${shiftLightness(accent, -0.18)})`,
          color: "#FFFFFF",
        }}
      >
        <div className="text-[11px] font-black tracking-wide">
          {row.title || "HOUSEFULL SALE"}
        </div>
        {row.dateLabel ? (
          <div className="mt-1 text-[9px] text-amber-200">{row.dateLabel}</div>
        ) : null}
      </div>
    </div>
  );
}

export default function MartCategoryThemes() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [categories, setCategories] = useState([]);
  const vertical = getAdminVertical();
  const onQuick = vertical === "quick";

  useEffect(() => {
    if (!onQuick) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const [catRes, campRes] = await Promise.all([
          adminAPI.getMartCategories(),
          adminAPI.getMartCampaigns(),
        ]);

        const catData = catRes?.data?.data;
        const allCats = Array.isArray(catData) ? catData : catData?.categories || [];
        const active = allCats.filter((c) => c.isActive !== false);
        setCategories(active);

        const core = active.filter((c) => !c.parentId);
        const flagged = core.filter((c) => c.showInHeader);
        // Same fallback the app uses, so the two agree on which screens exist.
        const header = flagged.length ? flagged : core;

        const campaigns = campRes?.data?.data || [];
        const byCategory = new Map(
          campaigns.map((c) => [c.categoryId ? String(c.categoryId) : DEFAULT_ROW_ID, c]),
        );

        const build = (id, label) => {
          const c = byCategory.get(id) || {};
          return {
            id,
            label,
            campaignId: c._id ? String(c._id) : null,
            title: c.title || "HOUSEFULL SALE",
            dealLabel: c.dealLabel || "CRAZY DEALS",
            dateLabel: c.dateLabel || "",
            startDate: toDateInput(c.startDate),
            endDate: toDateInput(c.endDate),
            bannerImageUrl: c.bannerImageUrl || "",
            themeColor: normalizeHex(c.themeColor, ""),
            accentColor: normalizeHex(c.accentColor, ""),
            searchHint: c.searchHint || "",
            isActive: c.isActive !== false,
            sortOrder: Number.isFinite(c.sortOrder) ? c.sortOrder : 0,
            tiles: (c.tiles || []).map((t) => ({
              title: t.title || "",
              badgeText: t.badgeText || "",
              emojis: t.emojis || "",
              imageUrl: t.imageUrl || "",
              categoryId: t.categoryId ? String(t.categoryId) : "",
            })),
            // The list endpoint populates these, so a saved deal card shows the
            // actual products rather than a column of ObjectIds.
            products: (c.productIds || [])
              .filter(Boolean)
              .map((p) =>
                typeof p === "object"
                  ? {
                      id: String(p._id),
                      name: p.name || "",
                      image: p.image || (p.images || [])[0] || "",
                      price: p.price,
                      mrp: p.mrp,
                    }
                  : { id: String(p), name: "(removed from catalogue)", image: "", price: "", mrp: null },
              ),
          };
        };

        setRows([
          build(DEFAULT_ROW_ID, 'Default — the "All" screen'),
          ...header
            .slice()
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .map((c) => build(String(c._id), c.name)),
        ]);
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load the Housefull Sale setup.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [onQuick]);

  const patch = (id, next) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const invalid = useMemo(
    () =>
      rows.filter(
        (r) =>
          (r.themeColor && !normalizeHex(r.themeColor)) ||
          (r.accentColor && !normalizeHex(r.accentColor)),
      ),
    [rows],
  );

  const handleSave = async () => {
    if (invalid.length) {
      toast.error("Colours must be 6-digit hex values like #E8F6EF, or left blank.");
      return;
    }
    try {
      setSaving(true);
      const saved = await Promise.all(
        rows.map(async (row) => {
          const body = {
            title: (row.title || "").trim() || "HOUSEFULL SALE",
            dealLabel: (row.dealLabel || "").trim(),
            dateLabel: (row.dateLabel || "").trim(),
            startDate: row.startDate || null,
            endDate: row.endDate || null,
            bannerImageUrl: (row.bannerImageUrl || "").trim(),
            themeColor: normalizeHex(row.themeColor, ""),
            accentColor: normalizeHex(row.accentColor, ""),
            searchHint: (row.searchHint || "").trim(),
            isActive: Boolean(row.isActive),
            sortOrder: Number(row.sortOrder) || 0,
            categoryId: row.id === DEFAULT_ROW_ID ? null : row.id,
            // Order is the array order — that is what the app rotates through.
            productIds: row.products.map((p) => p.id),
            tiles: row.tiles.map((t, i) => ({
              title: (t.title || "").trim(),
              badgeText: (t.badgeText || "").trim(),
              emojis: (t.emojis || "").trim(),
              imageUrl: (t.imageUrl || "").trim(),
              categoryId: t.categoryId || null,
              sortOrder: i,
            })),
          };

          if (row.campaignId) {
            await adminAPI.updateMartCampaign(row.campaignId, body);
            return row;
          }
          // Nothing worth creating for a screen the admin never touched.
          const untouched =
            !body.themeColor &&
            !body.accentColor &&
            !body.searchHint &&
            !body.bannerImageUrl &&
            body.tiles.length === 0 &&
            body.productIds.length === 0;
          if (untouched) return row;

          const res = await adminAPI.createMartCampaign(body);
          const created = res?.data?.data;
          return { ...row, campaignId: created?._id ? String(created._id) : null };
        }),
      );
      setRows(saved);
      toast.success("Housefull Sale saved. The app picks it up on next open.");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save the Housefull Sale setup.");
    } finally {
      setSaving(false);
    }
  };

  if (!onQuick) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="font-semibold text-amber-900">
                Switch the panel to Quick Commerce
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                The Housefull Sale belongs to the Quick Commerce catalogue. The panel is
                currently showing Food Delivery, so saving here would write a campaign the
                Mart app never reads.
              </p>
              <button
                type="button"
                onClick={() => {
                  setAdminVertical("quick");
                  window.location.reload();
                }}
                className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Switch to Quick Commerce
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Palette className="h-6 w-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-gray-900">Housefull Sale</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Everything the Mart sale banner shows: heading, colours, sale window, the deal
          card&apos;s rotating products, and the offer tiles. One campaign per header
          category, plus a default for the &quot;All&quot; screen.
        </p>
      </div>

      {rows.map((row) => {
        const open = openId === row.id;
        return (
          <div key={row.id} className="rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : row.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              )}
              <span
                className="h-6 w-6 rounded-md border border-slate-200"
                style={{ background: normalizeHex(row.themeColor, "#F3F4F6") }}
              />
              <span className="flex-1 font-semibold text-slate-900">{row.label}</span>
              <span className="text-xs text-slate-500">
                {row.tiles.length} tiles · {row.products.length} products
              </span>
              {!row.isActive ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  Inactive
                </span>
              ) : null}
            </button>

            {open ? (
              <div className="space-y-5 border-t border-slate-200 p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-3 md:col-span-2">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <TextField
                        label="Sale heading"
                        value={row.title}
                        placeholder="HOUSEFULL SALE"
                        onChange={(v) => patch(row.id, { title: v })}
                      />
                      <TextField
                        label="Deal card label"
                        value={row.dealLabel}
                        placeholder="CRAZY DEALS"
                        onChange={(v) => patch(row.id, { dealLabel: v })}
                      />
                      <TextField
                        label="Sale starts"
                        type="date"
                        value={row.startDate}
                        onChange={(v) => patch(row.id, { startDate: v })}
                      />
                      <TextField
                        label="Sale ends"
                        type="date"
                        value={row.endDate}
                        onChange={(v) => patch(row.id, { endDate: v })}
                      />
                    </div>
                    <TextField
                      label="Date strip override (optional — blank derives it from the dates)"
                      value={row.dateLabel}
                      placeholder="21ST AUG, 2026 - 20TH SEP, 2026"
                      onChange={(v) => patch(row.id, { dateLabel: v })}
                    />
                    <ColorField
                      label="Screen colour (header & banner)"
                      value={row.themeColor}
                      onChange={(v) => patch(row.id, { themeColor: v })}
                    />
                    <ColorField
                      label="Accent colour (deal card, badges)"
                      value={row.accentColor}
                      onChange={(v) => patch(row.id, { accentColor: v })}
                    />
                    <TextField
                      label="Search bar hint"
                      value={row.searchHint}
                      placeholder='e.g. "milk"'
                      onChange={(v) => patch(row.id, { searchHint: v })}
                    />
                    <ImageField
                      label="Banner image (optional)"
                      value={row.bannerImageUrl}
                      folder="maava/mart-sale/banners"
                      onChange={(v) => patch(row.id, { bannerImageUrl: v })}
                    />
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                        App preview
                      </label>
                      <Preview row={row} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={row.isActive}
                        onChange={(e) => patch(row.id, { isActive: e.target.checked })}
                        className="h-4 w-4"
                      />
                      Active
                    </label>
                    <TextField
                      label="Sort order"
                      type="number"
                      value={row.sortOrder}
                      onChange={(v) => patch(row.id, { sortOrder: v })}
                    />
                  </div>
                </div>

                <hr className="border-slate-200" />
                <ProductsEditor
                  products={row.products}
                  onChange={(products) => patch(row.id, { products })}
                />

                <hr className="border-slate-200" />
                <TilesEditor
                  tiles={row.tiles}
                  categories={categories}
                  onChange={(tiles) => patch(row.id, { tiles })}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </button>
      </div>
    </div>
  );
}

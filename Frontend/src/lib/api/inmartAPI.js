/**
 * HiberMart / InMart data, served from the quick-commerce vertical.
 *
 * The old backend had a dedicated `/inmart/*` namespace. This one has no such
 * routes -- what it has is the whole quick vertical, which is the same product
 * catalogue under a different name. So these are remapped, not stubbed.
 *
 * The old methods returned `response.data`, i.e. the envelope rather than the
 * axios response, and the screens read `res.success` / `res.data.<key>`
 * directly. That contract is reproduced exactly, because the screens are
 * copied byte-for-byte and read it that way.
 *
 * Shapes here were taken from the live responses, not guessed. The categories
 * endpoint returns a FLAT list carrying `parentId`, while the screens expect a
 * tree with `subCategories` -- InMart reads `rootCategory.subCategories.length`
 * unguarded, so a missing array is a crash, not an empty section.
 */
import apiClient from "@food/api/axios";

const QUICK = "/quick";

/** Unwrap this backend's envelope to a plain array, whatever nesting it uses. */
const toArray = (res, ...keys) => {
  const body = res?.data?.data ?? res?.data ?? null;
  if (Array.isArray(body)) return body;
  for (const k of keys) {
    const v = body?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
};

/** Never let one empty section fail the whole screen. */
const safe = (p) => p.then((r) => r).catch(() => null);

const slugify = (v) =>
  String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Flat category list -> the tree the screens expect.
 *
 * Every node gets `slug` (the API has none, and InMart matches its section
 * headers on slug) and `subCategories` (always an array, because it is read
 * without a guard).
 */
const buildCategoryTree = (flat) => {
  const norm = flat.map((c) => ({
    ...c,
    id: c.id ?? c._id,
    slug: c.slug ?? slugify(c.name),
    subCategories: [],
  }));
  const byId = new Map(norm.map((c) => [String(c.id), c]));

  const roots = [];
  for (const c of norm) {
    const parent = c.parentId ? byId.get(String(c.parentId)) : null;
    if (parent) parent.subCategories.push(c);
    else roots.push(c);
  }

  // A flat catalogue with no parents at all would render no sections, since
  // every root would have an empty subCategories. Treat that case as one level
  // deep so the grid still fills.
  //
  // The child MUST be a copy, not the node itself: pushing the node into its
  // own subCategories makes the tree cyclic, and the screens walk it
  // recursively -- that is a stack overflow, not an empty section.
  const anyNesting = norm.some((c) => c.parentId);
  if (!anyNesting) {
    for (const r of roots) {
      r.subCategories = [{ ...r, subCategories: [] }];
    }
  }
  return roots;
};

/**
 * Share one request between callers, and hold the answer briefly.
 *
 * InMart asks for the home payload and the navigation strip in the same
 * Promise.all, and both need categories -- so one screen produced two identical
 * requests, doubled again by the mount running twice. Four calls for one list
 * that changes rarely.
 *
 * In-flight sharing collapses the concurrent pair; the short TTL collapses the
 * remount. Deliberately short: this is a catalogue an admin edits, and a stale
 * category strip is worse than one extra request a minute.
 */
const memoise = (fn, ttlMs = 30000) => {
  let inFlight = null;
  let value = null;
  let at = 0;
  return (...args) => {
    const now = Date.now();
    if (value && now - at < ttlMs) return Promise.resolve(value);
    if (inFlight) return inFlight;
    inFlight = Promise.resolve(fn(...args))
      .then((v) => {
        value = v;
        at = Date.now();
        return v;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
};

const fetchCategories = memoise(async () => {
  const res = await safe(
    apiClient.get(`${QUICK}/restaurant/categories/public`, { contextModule: "user" }),
  );
  return buildCategoryTree(toArray(res, "categories", "items"));
});

const fetchTopBanners = memoise(async () => {
  const res = await safe(
    apiClient.get(`${QUICK}/top-banners/public`, { contextModule: "user" }),
  );
  return toArray(res, "banners", "topBanners", "items");
});

/**
 * The old `/inmart/home` was one composite call. Here it is assembled from the
 * quick vertical's public pieces, in parallel, so a missing section costs an
 * empty list rather than a blank page.
 *
 * `collections` has no equivalent -- the old backend's merchandising curation
 * was not carried over -- so it resolves empty, which is the honest answer
 * ("none configured") rather than an error.
 */
export const getInMartHome = async () => {
  const [categories, banners] = await Promise.all([
    fetchCategories(),
    fetchTopBanners(),
  ]);

  return { success: true, data: { categories, banners, collections: [] } };
};

export const getCategories = async () => ({
  success: true,
  data: { categories: await fetchCategories() },
});

/**
 * Navigation was an admin-curated menu in the old backend with no counterpart
 * here. Root categories are the closest real data, so the strip shows
 * something true rather than nothing.
 */
export const getNavCategories = async () => {
  const roots = await fetchCategories();
  return {
    success: true,
    data: {
      navigation: roots.map((c) => ({
        _id: c.id,
        id: c.id,
        name: c.name,
        slug: c.slug,
        image: c.image ?? c.icon ?? null,
        isActive: c.isActive !== false,
        subCategories: c.subCategories,
      })),
    },
  };
};

/** Quick-vertical foods, renamed to the `products` the old screens read. */
const toProduct = (f) => ({
  ...f,
  id: f.id ?? f._id,
  slug: f.slug ?? slugify(f.name),
  title: f.title ?? f.name,
  image: f.image ?? (Array.isArray(f.images) ? f.images[0] : null),
  images: f.images ?? (f.image ? [f.image] : []),
  price: f.price ?? 0,
  mrp: f.otherPrice || f.mrp || f.price || 0,
  category: f.category ?? f.categoryName ?? "",
  categoryId: f.categoryId ?? null,
  inStock: f.isAvailable !== false,
});

export const getProducts = async (filters = {}) => {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  const res = await safe(
    apiClient.get(`${QUICK}/restaurant/public/foods`, { params, contextModule: "user" }),
  );
  const products = toArray(res, "foods", "products", "items").map(toProduct);
  return { success: true, data: { products, total: products.length } };
};

export const getProductBySlug = async (slug) => {
  const { data } = await getProducts({});
  const product = data.products.find((p) => p.slug === slug || p.id === slug) ?? null;
  return { success: Boolean(product), data: { product } };
};

export const getStores = async () => {
  const res = await safe(
    apiClient.get(`${QUICK}/restaurant/restaurants`, {
      params: { limit: 200 },
      contextModule: "user",
    }),
  );
  return { success: true, data: { stores: toArray(res, "restaurants", "stores", "items") } };
};

export const getBanners = async () => ({
  success: true,
  data: { banners: await fetchTopBanners() },
});

// Curated merchandising the old backend owned and this one does not. Empty is
// the correct answer -- "nothing configured" -- and the screens degrade to
// their remaining sections rather than erroring.
export const getCollections = async () => ({ success: true, data: { collections: [] } });
export const getCollectionBySlug = async () => ({ success: false, data: { collection: null } });
export const getStories = async () => ({ success: true, data: { stories: [] } });

const inmartAPI = {
  getInMartHome,
  getCategories,
  getNavCategories,
  getProducts,
  getProductBySlug,
  getStores,
  getCollections,
  getCollectionBySlug,
  getStories,
  getBanners,
};

export default inmartAPI;

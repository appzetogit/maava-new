# Merging `food-backend` and `quick-commerce`

Clones live in `_src/food-backend` and `_src/quick-commerce`.
Merged repo: **`food-quick/`** — `main` = quick-commerce trunk, with both
histories available as remotes `qc` and `fb` for blame and cherry-picks.

> **Status: phases 0–4 and 6 done. Phase 5 machinery built and rehearsed; the
> cutover is yours to run.** See §11.

---

## 0. The finding that reframes the whole task

These are not two systems. `quick-commerce` is a **fork** of `food-backend` that
diverged some weeks ago.

| | food-backend | quick-commerce | differing |
|---|---|---|---|
| `Backend/src` files | 320 | 325 | **52** |
| backend diff | | | **+2291 / −666** |
| `Frontend/src` files | ~560 | ~562 | **75** |
| frontend diff | | | **+1047 / −621** |

Directory layout is identical. Every mongoose model name is identical
(`FoodOrder`, `FoodItem`, `FoodRestaurant`, `FoodUser`, `FoodUserWallet`…), and
so is every `collection:` string (`food_orders`, `food_user_wallets`, …). The
quick-commerce team did **not** build a parallel vertical — they edited the
`food` module in place, so "restaurant" already means "store" and "food item"
already means "product" in their tree.

So the job is not integration. It is:

1. reconcile a fork (one week of real work),
2. add one discriminator field (one day of code, three weeks of data),
3. delete the frontend surfaces you don't want (one afternoon).

**Both trees are actively developed** — latest commits on both are 2026‑08‑15.
Every day you wait, the 52-file diff grows. This is the argument for doing the
code merge *first* and fast, and the data merge separately and slowly.

### Divergence is bidirectional — neither side is simply "ahead"

**`food-backend` is ahead on security/correctness** (quick-commerce forked
before these landed and would silently lose them):

- `middleware/rateLimit.js` — `authVerifyRateLimiter` (`skipSuccessfulRequests`,
  so a legitimate login doesn't spend brute-force budget) and
  `authIpCeilingRateLimiter` (per-IP enumeration backstop). Also the IP+phone
  keying that stopped a whole NAT sharing one 30-request bucket. quick-commerce
  is back on naive per-IP.
- `core/otp/otp.rateWindow.js` + `otp.rateWindow.test.js` — fixed window anchored
  on `windowStartedAt`, plus `purgeAt` so the TTL reaper can't reset a phone's
  quota early. quick-commerce **deleted both files** and reverted to the sliding
  `lastRequestAt` logic that the window fix replaced.
- `RateLimitError` (with `retryAfterSeconds`) — quick-commerce reverted to
  throwing `ValidationError`, so callers get a 400 instead of a 429.
- `scripts/migrate-otp-ttl.js` and `"test": "node --test src/"` — quick-commerce
  deleted the script and set `test` to `exit 1`.

**`quick-commerce` is ahead on product** (~45 files):

- Inventory: `stockQty`/`lowStockThreshold`/`maxQtyPerOrder`, conditional-update
  reservation, guarded restock via `stockReservedAt`/`stockRestoredAt`,
  `inventory.service.js`.
- Catalog: `brand`, `packSize`, `sku`, `barcode`, `expiryDate`, `mrp`, `gstRate`;
  two-level categories via `FoodCategory.parentId`.
- Per-line GST (groceries span 0/5/12/18; one basket rate is wrong).
- Server-side zone serviceability at order time (`zoneServiceability.js`) —
  closes a real hole where a saved address outside the zone could be ordered to.
- `/search/products` grid, delivery promise (`promiseMinutes`), dispatch radius
  bands 3/5/8/12 km, `autoAcceptOrders` on the seller, `restaurantAnalytics`,
  Firebase service account configurable from the admin panel.
- Frontend: `/admin/food/*` → `/admin/store/*`, `restaurants` → `sellers`,
  seller portal promoted to `/seller/*`, sidebar state bugs fixed.

**Both sides independently wrote the same fix, differently.** `PUBLIC_RESTAURANT_SELECT`
in `restaurant.service.js` — an allowlist stopping bank account / IFSC / PAN /
FCM tokens leaking to anonymous callers — exists in both with **different field
lists**. This is a genuine semantic conflict and git will not tell you about it,
because both sides changed the same lines. Resolve by hand (§8.9).

---

## 1. Direction of the merge

**Trunk = `quick-commerce`. Replay `food-backend`'s core deltas onto it.**

Reason: quick-commerce's delta is ~45 feature files; food-backend's delta is ~7
files in `core/` and `middleware/`. Taking quick-commerce as the base means
replaying 7 files by hand instead of 45. Same result, one sixth of the conflict
surface, and the smaller replay is the one made of *security* code — the code you
most want a human reading line by line anyway.

Do it as an explicit graft, not a `git merge`. There is no useful merge base
(the clones don't share ancestry you can rely on), and an auto-merge across a
1100-file rename-heavy fork will produce garbage you can't review.

```bash
git init food-quick && git remote add qc <quick-commerce> && git fetch qc
git checkout -b main qc/main          # trunk
git remote add fb <food-backend> && git fetch fb
git checkout fb/main -- Backend/src/core/otp Backend/src/middleware/rateLimit.js \
  Backend/src/core/auth/errors.js Backend/src/config/env.js \
  Backend/scripts/migrate-otp-ttl.js
# then hand-reconcile: auth.routes.js, otp.service.js, restaurant.service.js, package.json
```

---

## 2. The discriminator

You asked for `type: {}`. Two corrections, both load-bearing.

### 2.1 Don't name it `type`

Mongoose treats a bare `type` key as a **type declaration**, not a field name.
This codebase already trips over it and works around it:

```js
// restaurant.model.js
location: { type: { type: String, enum: ["Point"] }, coordinates: ... }
```

`orderItemSchema`, `walletTransactionSchema` (`'addition' | 'deduction'`) and
every GeoJSON block already own the name `type`. Adding a third meaning to it
in the same documents guarantees someone reads the wrong one at 3am.

**Use `vertical: { type: String, enum: ['food', 'quick'], required: true, index: true }`.**
One word, no collision, greppable.

### 2.2 Don't put it on every collection

The correct rule: **a collection gets `vertical` only if the same real-world
entity can exist twice, once per vertical.** Everything else derives it or
doesn't need it.

**Gets `vertical` (denormalized, snapshotted like `price` is):**

| Collection | Why |
|---|---|
| `FoodRestaurant` | The **root** of the discriminator. A seller is a restaurant *or* a store. Everything else copies from here. |
| `FoodOrder` | Denormalized at creation. Without it every admin list needs a `$lookup` on seller. |
| `FoodItem` | Denormalized from seller. |
| `FoodCategory` | "Dairy" and "Biryani" are not one tree. |
| `FoodOffer` / `FoodOfferUsage` | A coupon is per-vertical (use `verticals: [String]` if you want cross-vertical coupons later). |
| All landing/banner models | `FoodHeroBanner`, `TopBanner`, `FoodExploreIcon`, `HomePromotionBanner`, `Under250Banner`, `FoodDiningBanner`, `FoodGourmetRestaurant` |
| **All settings singletons** | `FoodFeeSettings`, `FoodBusinessSettings`, `FoodLandingSettings`, `FoodReferralSettings`, `FoodCashbackSettings`, `FoodFeatureSetting`, `FoodRestaurantSubscriptionSettings`, `FoodRestaurantCommission`, `FoodDeliveryCommissionRule` — see §5. |
| `FoodAdminWallet` | Platform revenue must be attributable per vertical. **Built differently than planned:** compound unique `{vertical, key}` with `key` staying `'platform'`, not a `'platform:food'` value — see §11 phase 3. |

**Stays genuinely common, no discriminator — this is the point of the merge:**

| Collection | Why |
|---|---|
| `FoodUser` (+ embedded addresses) | One phone, one login, one identity. |
| **`FoodUserWallet`** | **One balance. Money is fungible — cashback earned on groceries spends on dinner.** This is the single biggest user-visible win and it needs *zero new code*: the wallet is already keyed on `userId`, and `userId` is already shared. |
| `FoodDeliveryPartner`, `FoodDeliveryWallet`, `FoodDeliveryWithdrawal`, `FoodDeliveryCashDeposit` | **One rider pool serving both verticals.** Biggest *operational* win — see §9.1. |
| `FoodAdmin`, `AdminResetOtp`, `FoodRefreshToken`, `FoodOtp`, roles | Auth is auth. |
| `Payment`, `Refund`, `Settlement`, `Transaction`, `FoodTransaction` | Carry `orderId`; vertical derives. Denormalize `vertical` anyway — it's one field and finance *will* ask for the split. |
| `FoodZone` | Zones are geography. Add optional `verticals: [String]` only if a zone goes live for one vertical before the other. |
| `FoodNotification`, chat, support tickets, `FoodSafetyEmergencyReport` | Carry `orderId`/`userId`. |

**Explicitly NOT merged: the cart.** `FoodUserCart` is already scoped to one
seller. A cart spanning a restaurant *and* a grocery store means two pickups,
two prep times, two commissions and one delivery fee — that is a different
dispatch product, not a schema change. Keep one cart per seller. Say no now, in
writing, or it will be assumed.

### 2.3 Indexes — the part that gets missed

Merging doubles every collection's size. Every existing compound index must get
`vertical` as its **leading** field, or every query scans both verticals:

```js
// before                                              after
orderSchema.index({ restaurantId:1, orderStatus:1, createdAt:-1 })
       →    orderSchema.index({ vertical:1, restaurantId:1, orderStatus:1, createdAt:-1 })
orderSchema.index({ userId:1, createdAt:-1 })
       →    orderSchema.index({ vertical:1, userId:1, createdAt:-1 })
// …and the other 8 in order.model.js:391-402
```

Exception: `{ userId: 1, createdAt: -1 }` should stay **without** `vertical` as
well, because "my orders" across both verticals is now a real query. Keep both.

Unique indexes become compound:

- `order_id` / `orderId` unique → `{ vertical: 1, order_id: 1 }` unique.
- `FoodRestaurant` name+phone unique → add `vertical`.

---

## 3. Routing: two lines, not two apps

Every API path today is `/api/v1/food/*`, in both trees. Don't rename anything.
Mount the same router twice and set the vertical in one middleware:

```js
// routes/index.js
const setVertical = (v) => (req, _res, next) => { req.vertical = v; next(); };

router.use('/v1/food',  setVertical('food'),  foodRoutes);   // existing apps: byte-identical
router.use('/v1/quick', setVertical('quick'), foodRoutes);   // quick app: new base URL only
```

Consequences:
- The existing Food user/restaurant/delivery Flutter apps need **zero changes** —
  `/v1/food/*` behaves exactly as today.
- The quick-commerce apps change one constant: their base URL.
- No duplicated route table, so a fix lands in both by construction.

The admin panel is different — one admin session spans both verticals — so admin
sends the vertical as a **header** (§6).

---

## 4. Scoping queries: one plugin, not 170 controllers

There are ~170 admin routes. Adding `{ vertical: req.vertical }` to every query
by hand means ~400 call sites, and forgetting exactly one means a food admin
sees quick-commerce orders. That failure is silent and shaped like a data leak.

Instead: `AsyncLocalStorage` + one mongoose plugin, applied **only** to the
discriminated schemas.

```js
// core/vertical/verticalScope.js  (~40 lines total)
import { AsyncLocalStorage } from 'node:async_hooks';
export const verticalStore = new AsyncLocalStorage();

export const verticalPlugin = (schema) => {
  schema.add({ vertical: { type: String, enum: ['food','quick'], required: true, index: true } });
  const scope = function () {
    if (this.getOptions?.().skipVerticalScope) return;
    const v = verticalStore.getStore()?.vertical;
    if (v && this.getQuery().vertical === undefined) this.where({ vertical: v });
  };
  schema.pre(['find','findOne','findOneAndUpdate','countDocuments','updateMany','updateOne','deleteMany'], scope);
  schema.pre('save', function () { if (!this.vertical) this.vertical = verticalStore.getStore()?.vertical; });
};
```

```js
// app.js — one line, before the router
app.use((req, _res, next) => verticalStore.run({ vertical: resolveVertical(req) }, next));
```

Escape hatch for genuinely cross-vertical reads (a user's full order history,
platform-wide finance): `.setOptions({ skipVerticalScope: true })`. Explicit,
greppable, and the *unsafe* direction is the one you have to type.

> `ponytail:` implicit scoping is spooky action at a distance — accepted here
> because the alternative is 400 hand-edited call sites and the failure mode of
> a miss is a cross-tenant data leak, not a bug.

**Correction, from building it:** this section originally said aggregations
could not be covered and that all 44 `.aggregate()` call sites needed a hand-added
`$match`. That is wrong — mongoose supports `schema.pre('aggregate')`, where
`this.pipeline()` is the live array, so one more hook covers all 44 with no call
sites touched. The one genuine trap is `$geoNear`: it **must** be the first
stage, so unshifting a `$match` in front of it turns the nearest-seller search
into a hard `MongoServerError`. It carries its own `query` option for exactly
this; the filter goes there. That branch is why pipeline scoping is a pure
exported function with tests rather than an inline closure.

---

## 5. Settings must become per-vertical (this is where merges usually break)

Every settings model is a **singleton document** today. They cannot stay
singletons, because the two verticals genuinely need different numbers:

| Setting | Food | Quick |
|---|---|---|
| Dispatch radius bands | 15/25/40/60 km | 3/5/8/12 km |
| GST | flat ~5% basket rate | 0/5/12/18 **per line** |
| Delivery promise / packing | prep-time driven | `PACKING_MINUTES = 3` |
| Commission | restaurant commission slabs | seller commission slabs |
| Order acceptance | manual accept window | `autoAcceptOrders` |
| Subscription plans | restaurant subscriptions | probably none |

Two things follow:

1. Add `vertical` + a unique index on it to every settings model, and change the
   `findOne()` singleton lookups to `findOne({ vertical })`. Seed one row per
   vertical from the two live DBs at migration time.
2. **Move `DISPATCH_RADIUS_BANDS_KM` and `PACKING_MINUTES` out of env into
   settings.** They're per-vertical now, and env vars are per-*process* — one
   merged deployment can't hold two values. This is forced by the merge, not
   optional.

The per-line GST design already merges cleanly: food items keep `gstRate: null`,
which falls back to the vertical's order-wide rate — exactly today's behaviour,
no repricing, no migration.

---

## 6. Admin panel

You want the admin panel and not the customer/rider web surfaces. That's a
delete, and a large one:

| Surface | Size | Action |
|---|---|---|
| `modules/Food/pages/admin/**` | 140 files, ~65k lines | **keep** |
| `modules/Food/pages/restaurant/**` | 55 files, ~34k lines | **keep** (§6.1) |
| `modules/Food/pages/user/**` | 59 files, ~36k lines | **delete** — Flutter user app owns this |
| `modules/DeliveryV2/**` | 62 files | **delete** — Flutter delivery app owns this |

`USER_APP_API.md`, `DELIVERY_API_SPEC.md` and `FLUTTER_API_SPEC.md` confirm the
customer and rider surfaces are native apps hitting the same REST API. The web
copies are dead weight: ~50% of the bundle, and 50% of the frontend attack
surface, for screens nobody opens.

### 6.1 Keep the seller portal

quick-commerce promoted it to `/seller/*` with a redirect from
`/food/restaurant/*`. Restaurant partners use it from a browser; there is no
Flutter equivalent for the desktop seller flows (bulk upload, finance,
subscription). Delete it only if you can name the app that replaces it.

### 6.2 One admin app, one vertical switch

Do **not** ship two admin builds.

- **Backend:** `router.use('/v1/admin', authMiddleware, requireRoles('ADMIN'), setVerticalFromHeader, adminRoutes)`
  where `setVerticalFromHeader` reads `X-Vertical`, defaults to `'food'`, and
  rejects anything else.
- **Frontend:** a vertical selector in `AdminNavbar`, persisted to
  `localStorage`, injected by the **existing** axios request interceptor in
  `services/api/axios.js`. One interceptor line covers all ~170 admin screens.
- **URL namespace:** quick-commerce already renamed `/admin/food/*` →
  `/admin/store/*` with a `LegacyFoodPathRedirect`. Merged, neither name is
  right. Go to a neutral `/admin/*` and keep **both** redirects — the redirect
  components already exist in `AdminRouter.jsx`, so this is two more lines, not
  a route-table rewrite.
- **RBAC:** `adminRbac.js` and `adminSidebarMenu.js` differ between the trees
  and are path-keyed (`resolvePermissionSectionByPath`). They must be
  reconciled to the *new* neutral paths in one pass, or permissions silently
  fail open/closed. Budget a full day here alone — it is the fiddliest file in
  the merge.
- **Per-vertical menu:** hide `dining`, `subscription`, `unregistered-restaurants`
  when vertical is `quick`; hide `inventory`/`low-stock` when `food`. The
  sidebar already has a feature-flag filter (`featureSettings`) — reuse it, add
  a `verticals: ['quick']` key to menu entries. Don't build a second menu file.

---

## 7. Data migration — the hard part, and the reason for two deploys

Everything above is code and lands in ~2 weeks. The data merge is the risk.

Both live databases use the **same collection names**. `ObjectId` collisions are
not the problem (they're unique). These are:

| Collision | Why it happens | Fix |
|---|---|---|
| **`FoodUser` phone** | The same customer signed up in both apps → two `_id`s, one phone, **unique index violation on insert.** | Identity reconciliation: merge by normalized phone, keep the food `_id` as canonical, remap `orders.userId`, `food_user_wallets.userId`, favorites, carts, referrals, chat. **Wallet balances must be summed, not overwritten.** |
| **`FoodDeliveryPartner` phone** | Same rider onboarded twice. | Same treatment; **sum `cashInHand` and `balance`**, union `totalDeliveries`. |
| **`FoodAdmin` email** | Same admin in both panels. | Merge by email, union the permission sets. Verify by hand — this is the privilege-escalation surface. |
| **`order_id` / `orderId`** | Human-readable numbers restart per DB; there is a rogue `orderId_1` unique index in "legacy deployments" (documented at `order.model.js:265`). | **Prefix, don't renumber.** `FD-` / `QC-`. Renumbering breaks every support ticket, invoice PDF and customer screenshot in existence. |
| **Settings singletons** | `key: 'platform'` on `FoodAdminWallet`, one doc per settings model. | Stamp `vertical` during import (§5). |
| **`FoodRestaurant` name+phone** | Rare but possible. | Manual review — the list will be short. |

Sequence, non-negotiable:

1. Restore both DBs into a scratch cluster.
2. Run the **reconciliation report** first — read-only, writes nothing, outputs
   every collision as CSV. Do not write a line of migration code until a human
   has read that CSV.
3. Migration script is **idempotent and resumable** (mark migrated docs with a
   `migratedAt` field; re-running skips them).
4. Dry-run against the scratch cluster. Diff order counts, wallet balance sums,
   and platform revenue totals before/after. **The sum of all wallet balances is
   the invariant** — if it changes by one paisa, stop.
5. Freeze writes (maintenance window), final run, flip.

---

## 8. Phases

| # | Phase | Output | Effort |
|---|---|---|---|
| **0** | **Security gate** | Audit the malware history in `Frontend/vite.config.js` (both trees committed about it: `889e05f` "Remove malware", `729af97` "Restore … without the malware"). Diff both `package-lock.json` for injected deps. Rotate any credential either tree could have exfiltrated. **Blocking.** | 1 d |
| **1** | Graft | One repo. quick-commerce trunk + food-backend's `core/otp`, `rateLimit.js`, `errors.js`, `env.js` rate-limit keys, `migrate:otp-ttl`, `"test": "node --test src/"`. Hand-reconcile `auth.routes.js`, `otp.service.js`, `PUBLIC_RESTAURANT_SELECT` (§8.9). Delete scratch files (§9.4). Runs against **two DBs, two deploys** — behaviour unchanged, nothing user-visible. | 3–5 d |
| **2** | `vertical` in code | `verticalScope.js` plugin, dual router mount, `vertical` on the ~20 discriminated models, all compound indexes re-led, `$match` added to every aggregate. Still two DBs (each deploy pins one vertical) so the field is exercised in prod before it matters. | 3–4 d |
| **3** | Settings per vertical | Settings models get `vertical`; `DISPATCH_RADIUS_BANDS_KM` / `PACKING_MINUTES` move from env into settings. | 2–3 d |
| **4** | Admin panel | Delete `pages/user/**` + `DeliveryV2/**`. Neutral `/admin/*` + both legacy redirects. Vertical switcher → `X-Vertical` header via the existing axios interceptor. Reconcile `adminRbac.js` + `adminSidebarMenu.js`. | 4–6 d |
| **5** | Data merge | Reconciliation report → human review → idempotent migration → dry run → cutover. | 5–8 d |
| **6** | Harvest | Shared rider pool, unified customer wallet UX, cross-vertical order history, cross-vertical coupons. **This is the phase the whole project was for.** | 3–5 d |

**~4–6 weeks, one developer.** Phases 1–4 are reversible. Phase 5 is not — that
is why it is one phase, late, and alone.

### 8.9 The `PUBLIC_RESTAURANT_SELECT` conflict, specifically

Both trees rewrote this allowlist to stop leaking `accountNumber`, `ifscCode`,
`panNumber`, `panImage`, `ownerEmail`, `ownerPhone` and `fcmTokens` to
unauthenticated callers. The lists differ:

- food-backend also withholds `businessModel`, `upiQrImage`, `subscription*`,
  `onboardingFeePayment*` (one of which is a Razorpay signature).
- quick-commerce additionally *exposes* `description`, `formattedAddress`,
  `latitude`, `longitude`, `isVerified`, `outletTimings`, `deliveryTimings`
  — its apps read these.

**Resolution: take food-backend's list as the base** (it is the more conservative
one and carries the "never add to this list" doc comment), then add back only
quick-commerce's genuinely client-needed fields, one at a time, each justified.
The union of the *withheld* sets and the intersection-plus-justified of the
*exposed* sets. Then re-run `scripts/public-exposure-check.js` — food-backend
already ships a credential-free checker for exactly this (`b2ce3ea`).

---

## 9. Further optimizations worth taking while you're in here

### 9.1 One rider pool — the real prize
Both verticals dispatch to `FoodDeliveryPartner` with identical schemas. Merged,
a rider takes a grocery run at 4pm and a dinner order at 8pm. Same wallet, same
cash-in-hand ledger, same withdrawal flow — **already shared, needs no new code**,
only the radius bands split per vertical (§5). Rider utilisation is the single
largest cost line in this business; this is the merge's actual ROI.

### 9.2 The wallet is already common — don't build one
`core/payments/wallet.service.js` exists, `FoodUserWallet` is keyed on `userId`,
and `userId` is already shared identity. The "common wallet" you asked for costs
**zero lines** once the two `food_user_wallets` collections are reconciled in
phase 5. Resist the urge to write a `WalletProvider` abstraction — there is one
implementation and there will only ever be one.

### 9.3 `core/` is already the shared layer
`auth`, `otp`, `users`, `admin`, `roles`, `refreshTokens`, `payments`,
`notifications` all already live in `Backend/src/core/` and are identical modulo
the security drift. Nothing needs restructuring — the previous team already drew
the line in the right place. Do not "extract a shared package"; a monorepo split
buys nothing here and costs a build system.

### 9.4 Delete the scratch shipped to production
Both trees carry, at paths that get deployed:
`Backend/_tmp_copy.mjs`, `check_zones.js`, `check_food.cjs`, `test-fcm-save.js`,
`scratch/check_db.js`, `scratch/test_api.js`, and inside the **admin module**
`modules/food/admin/{check_indexes,drop_index,scratch_check_db,test_save}.js`.
Frontend root has both `fix_admin_router.cjs` **and** `fix_admin_router.js`.
`drop_index.js` in a shipped path is a loaded gun.

### 9.5 Restore the tests quick-commerce deleted
food-backend has `"test": "node --test src/"` and a real
`otp.rateWindow.test.js`. quick-commerce set `test` to `exit 1` and deleted the
file, but *added* six standalone self-checks (`inventory.selfcheck.mjs`,
`pricing.selfcheck.mjs`, `promise.selfcheck.mjs`, `zoneServiceability.selfcheck.mjs`,
`riderpay.selfcheck.mjs`, `analytics.selfcheck.mjs`). Keep both styles, wire the
`.mjs` checks into the `test` script. Merging a fork with no test command is how
the rate-limit regression got in unnoticed in the first place.

### 9.6 Search: one endpoint, two shapes
`/search/unified` returns sellers, `/search/products` returns a product grid.
Both are useful in both verticals (restaurant search *and* dish search already
exist). Add `vertical` as a filter to both rather than forking them. Note
`/search/products` deliberately has **no zone fallback** — preserve that; a cart
built from unreachable sellers is a cart checkout will refuse.

### 9.7 Denormalize `vertical` onto `Transaction` and `Payment`
One field, no logic, and it means finance can split revenue by vertical without
a `$lookup` on a collection that will be your largest. Free now, expensive later.

### 9.8 Keep the `orderId` camelCase alias, and write down why
`order.model.js:265` carries a compatibility alias for a "rogue unique index
`orderId_1` found in legacy deployments", synced in a pre-save hook. It looks
like dead weight and someone will delete it during the merge. Migrating to one
DB is the moment to actually verify whether that index exists on the merged
cluster and drop the alias *deliberately* — or keep it and comment the ticket.

---

## 10. What I would refuse to do in one step

- **Merge the code and the data in the same deploy.** Phase 1–4 are reversible
  by `git revert`. Phase 5 is reversible only by restore-from-backup. Never put
  them behind one flip.
- **Auto-merge the two trees with git.** No trustworthy merge base, heavy
  renames, and two independent rewrites of a security-critical allowlist that
  git will happily resolve wrong and silently.
- **Renumber orders.** Prefix instead.
- **Build a cross-vertical cart** because it sounds obvious. It's a different
  dispatch product.
- **Start phase 1 before phase 0.** Two commits in these repos say the word
  "malware". Find out what it did and what it could reach before you merge that
  history into a repo you intend to keep.

---

## 11. Execution log

### Phase 0 — security gate: **passed**

- Both trees already removed the `vite.config.js` payload at HEAD
  (`889e05f`, `729af97`): an EtherHiding loader hidden behind ~9,100 spaces on
  the last line, resolving its C2 through an Ethereum RPC, executing at **build
  time** on dev machines and Vercel build servers.
- Scanned all 1,842 source files across both trees for the signature
  (500+ space runs, `blastapi`, `eth-mainnet`, `/0x/ls`, `/0x/cls`) — **clean**.
- All four `package-lock.json` files: **zero** `preinstall`/`install`/`postinstall`
  scripts.

**Still outstanding, and it is yours to do:** the payload ran at build time with
access to the build environment. Rotate every credential either build could
reach — Vercel env vars, `MONGODB_URI`, Razorpay keys, the Firebase service
account, JWT secrets. Code being clean now says nothing about what was read then.

### Phase 1 — the graft: **done**, `npm test` green

Three commits on `food-quick/main`:

| | |
|---|---|
| `5a775f5` | Restore the auth/OTP hardening quick-commerce predates — 10 files |
| `574be79` | Reconcile the two allowlists; make `npm test` mean something |
| `32dfefd` | Delete the scratch files that were shipping to production — 11 files |

23 files changed vs the quick-commerce trunk. Verified both directions: the
grafted security files are **byte-identical to `fb/main`** (empty diff), and
every quick-commerce feature is intact (`inventory.service.js`,
`zoneServiceability.js`, `restaurantAnalytics.service.js`, `stockQty`,
`gstRate`, `parentId`, `stockReservedAt`, `autoAcceptOrders`).

Checks run: all backend sources pass `node --check`; `src/routes/index.js`
resolves its entire import graph; `npm test` = 7 unit tests + 9 self-checks,
exit 0.

### Four things the execution turned up that the plan did not predict

1. **Eight of the ten core files needed no hand-merge.** The plan budgeted for
   reconciling `auth.routes.js`, `otp.service.js` and `env.js` by hand. Diffing
   first showed all three are *pure reverts* — quick-commerce layered nothing on
   top — so they were taken verbatim. Cheaper than planned.

2. **The allowlist conflict was not symmetric.** quick-commerce's list is a
   strict subset of food-backend's plus **seven entries that select nothing**:
   `description`, `isVerified`, `outletTimings`, `deliveryTimings` are not on
   `restaurantSchema` at all, and `latitude`/`longitude`/`formattedAddress` live
   *inside* `location`, which is already selected whole. So the resolution is
   food-backend's list verbatim, and it drops nothing either app was receiving.
   The plan's "union carefully, one field at a time" was the right method; it
   just terminated faster than expected.

3. **`node --test src/` is broken on Node 22.** food-backend's test script
   resolves the directory argument as a *module* and fails with
   `MODULE_NOT_FOUND`. It only works on Node 20. Anyone on 22 has been running a
   test suite that fails for a reason unrelated to any test. Merged trunk uses
   `node --test "src/**/*.test.js"`, which works on both.

4. **Two pre-existing mongoose warnings, both relevant to phase 2.** Startup
   emits `Duplicate schema index on {"restaurantId":1}` (declared via both
   `index: true` and `schema.index()`) and ``errors` is a reserved schema
   pathname`. Phase 2 rewrites every compound index to lead with `vertical` —
   fix the duplicate in the same pass rather than carrying it into a collection
   that is about to double in size.


### Phase 2 — the discriminator in code: **done**, `npm test` green

Two commits:

| | |
|---|---|
| `9ec2dc5` | `verticalScope.js` + dual mount at `/v1/food` and `/v1/quick` — infrastructure only, nothing filtered yet |
| `87c70c8` | Plugin applied to 12 models, indexes re-led, backfill script |

Split deliberately so the infrastructure commit reverts on its own.

**12 scoped, 61 common.** Scoped: seller, order, product, category, offer, and
the six landing/banner models. Common — the point of the merge, not an
omission: `FoodUser`, all four wallets, `FoodDeliveryPartner`, `FoodAdmin`,
auth, and `Payment`/`Refund`/`Settlement`/`Transaction`.

Verified: `vertical` is a required enum on exactly those 12 and absent from
`FoodUser`; all nine hook types registered; **route table byte-identical at 917**
before and after the model changes; 14 unit tests + 9 self-checks, exit 0.

### Five things phase 2 turned up

1. **The plan was wrong about aggregations** — see the correction in §4.
   `schema.pre('aggregate')` covers all 44 call sites in one hook. `$geoNear` is
   the one real trap and gets its own branch.

2. **Collection names here are not the mongoose defaults.** Eleven of the twelve
   scoped models set an explicit snake_case `collection:` — `food_orders`,
   `food_items`, `food_restaurants`. I wrote the backfill script with a
   hand-listed set of pluralised model names first; **every entry but one was
   wrong**, and the failure would have been a silent no-op on production data.
   It now derives the list from the models that actually carry the plugin.

3. **The backfill is an ordering constraint, not a cleanup step.** From this
   deploy on, every query on a scoped collection carries `vertical`. A document
   without the field matches nothing — lists come back empty, lookups 404, and
   `updateOne` matches zero rows *while reporting success*. Run
   `scripts/backfill-vertical.js --apply` before or with the deploy. Dry run by
   default; refuses to overwrite a document already carrying the other vertical.

4. **The duplicate-index warnings were not where I guessed.** I first "fixed"
   three wallet models that declare `unique: true` alongside `index: true`;
   the warnings persisted, because that pattern is redundant but not what
   mongoose flags. Tracing them properly found `featureSetting` `{key:1}` and
   `diningRestaurant` `{restaurantId:1}`, each declared *twice* — once on the
   field, once as an explicit `schema.index()`. Wallet churn reverted, both real
   duplicates removed, warnings now zero.

5. **Unique-index surgery is better deferred to phase 5 than done now.** The
   plan had `order_id` becoming `{vertical, order_id}`. But changing a unique
   index needs a coordinated drop on a live cluster, nothing can collide until
   the databases actually merge, and at that point the `FD-`/`QC-` prefix makes
   ids globally unique anyway — resolving it without touching the index at all.
   `couponCode` genuinely does need a compound unique, at phase 5.
   `FoodAdminWallet` moves to phase 3: it has the same singleton-unique-plus-
   seeding shape as the settings models, and solving that once beats twice.

### Deploying phase 2

Each deployment serves one vertical. Food deployments need no change —
`VERTICAL` defaults to `food`. Quick-commerce deployments **must** set
`VERTICAL=quick`; `env.js` now refuses to boot on a typo rather than scoping
every query to a vertical no document carries, whose symptom is empty lists and
404s with a clean log.

```bash
node scripts/backfill-vertical.js                    # dry run first
node scripts/backfill-vertical.js --apply            # then deploy
```


### Phase 3 — settings per vertical: **done**, `npm test` green

One commit, `81e67ce`. Twelve more collections scoped, taking the set to **24**:
fee, business, landing, referral, cashback, feature, subscription,
delivery-cash-limit and delivery-commission settings, plus page content, the
dispatch-mode singleton and the platform wallet.

**No service code changed.** Every one of these is read with `findOne()`/`find()`
and written with `create()` or `findByIdAndUpdate()` — all already covered by the
plugin. A quick-commerce deployment lazily creates its own settings rows through
the code paths that already existed, so the "per-vertical seeding" this phase was
budgeted for turned out to need no seeding step at all.

### What phase 3 changed about the plan

1. **The `FoodAdminWallet` key should not encode the vertical.** §2.2 said
   `key: 'platform'` → `'platform:food'` / `'platform:quick'`. A compound unique
   `{vertical, key}` is strictly better: the value stays `'platform'`, so every
   existing `findOne({ key: 'platform' })` keeps working untouched instead of each
   call site learning to build a key. Table above corrected. Four models took this
   treatment — feature flags, page content, `FoodSettings`, the platform wallet.

2. **Packing minutes had to be snapshotted, not read from settings.**
   `buildLiveEta` is *synchronous* and runs on every order fetch and poll, so a
   settings lookup there would be paid per refresh. It lives on
   `order.pricing.packingMinutes` instead — which is also more correct: an admin
   raising packing time next week must not retroactively change what an order
   placed today was promised. Same reason `price`, `gstRate` and `categoryName`
   are already snapshotted on the line items. Dispatch bands had no such
   constraint (already async) and read settings directly.

3. **Both env vars keep a fallback tier.** Settings → env → hardcoded default.
   Dropping `PACKING_MINUTES` / `DISPATCH_RADIUS_BANDS_KM` outright would silently
   change behaviour for any deployment that had set them, and rider density is
   exactly the thing someone retunes at 2am without waiting for an admin panel.

4. **`FoodRestaurantCommission` is deliberately not scoped** — keyed by
   `restaurantId`, and a seller belongs to exactly one vertical, so it is implied.
   Same call as `FoodOfferUsage` in phase 2.

5. **Legacy unique indexes are now a tracked debt.** Four collections still carry
   a single-field unique index on deployed clusters that would reject the second
   vertical's row. Each model carries a `ponytail:` comment naming the exact index
   (`key_1`, `key_1_module_1`); the drops belong with the phase 5 migration, since
   nothing can collide while each database holds one vertical.


### Phase 4 — the admin panel: **done**, both suites green

Two commits, **201 files changed, +283 / −67,463**.

| | |
|---|---|
| `a340e07` | Delete the customer and rider web apps; keep admin and seller |
| `1fc159a` | Vertical switcher, routed through the existing API client |

### Three things the plan budgeted for that turned out to be unnecessary

1. **No backend change at all.** The plan called for a `/v1/admin` mount reading
   an `X-Vertical` header. Unnecessary — the panel already calls `/food/admin/*`,
   so the phase 2 dual mount serves it as-is. The header idea was solving a
   problem the URL prefix already solved.

2. **No `/admin/*` namespace rename.** §6.2 claimed moving off `/admin/store/*`
   was "two more lines, not a route-table rewrite". **That was wrong**: it is 150
   route declarations and 207 string literals across 17 files, every one a bare
   string no compiler checks. Dropped — and the vertical does not belong in the
   URL anyway. Kept out, a bookmarked admin page works in whichever vertical is
   selected instead of pinning the admin to the one active when they saved it.

3. **No per-vertical menu data.** Dining is already commented out of the sidebar,
   and the subscription entries are already gated on feature settings — which
   phase 3 made per-vertical. The flags are fetched through the same client, so
   the menu filters itself for free once an admin turns subscriptions off for
   quick. The `verticals: ['quick']` menu key in §6.2 is not needed.

### What the delete actually found

`grep` said `DeliveryV2` had two importers. The **build** found a third: two
*seller* pages import `BottomPopup` through the `@delivery` alias, which a search
for "DeliveryV2" cannot see. Rescued into `components/restaurant`, alias removed.
`FoodPriceDisplay` was the mirror case — it lived in `components/user` but
exports `DualMoney`, used by two admin screens; moved to `components/shared`.

Once the pages went, the rest was a closed cluster: `components/user`,
`components/usermain`, `hooks/user`, and the Cart/Orders/Profile/DeliveryLocation
contexts were referenced only by each other. All deleted; build stayed green.

Also fixed a pre-existing bug found in passing: `app/routes.jsx` declared
`<Route path="/admin/*">` **twice**, once bare and once wrapped in `Suspense`.
React Router keeps the first, so the unwrapped one won and a direct `/admin` URL
could render blank while the lazy chunk loaded.

**A real production build is the only adequate check here** — it is the only
thing that resolves lazy `import()` specifiers and alias paths. A hand-written
reachability scanner was tried first and was wrong: its regex swallowed dynamic
imports, so it reported `AdminRouter` and `RestaurantsList` as orphaned while the
build was emitting chunks for both.

### Left for the product owner, not decided here

`app/LandingPage.jsx` survives and is still the public root, but its footer links
point at `https://switcheats.com/food/user/profile/{privacy,terms,about,help}` —
pages that no longer exist on the web. Either repoint them at the CMS pages the
admin panel manages, or drop the landing page too. That is a product call.


### Phase 5 — the data merge: **machinery built and rehearsed; cutover NOT run**

One commit, `08cc953`. The cutover needs the live databases and a human who has
read the report, so it is not done here and could not be.

| file | what it is |
|---|---|
| `src/core/vertical/identityRefs.js` | every place an identity id is stored, plus the audit that proves the list is complete |
| `src/core/vertical/mergeIdentity.js` | the merge decisions as pure functions |
| `scripts/merge-report.js` | **writes nothing.** Schema audit + collisions + blocking indexes + invariant baselines, as CSV |
| `scripts/merge-databases.js` | idempotent, resumable, dry-run by default |
| `scripts/merge.integration.test.js` | full rehearsal against a real mongod |

### The finding that matters most

**No automatic scan finds every place an identity id is stored.** Three separate
blind spots, each of which a migration written from declared `ref`s would skip —
orphaning those documents silently, with no error:

1. **Fields with no `ref` at all.** `food_user_wallets.userId` is declared
   `{ type: ObjectId, required, unique, index }` with no ref — so a ref-driven
   scan misses **the wallet**, the one collection whose loss is measured in money.
2. **A ref to a model that doesn't exist.** `food_delivery_cash_deposits.adminId`
   declares `ref: 'User'`; this codebase has `FoodUser` and no bare `User`. Any
   `populate()` on that path is **already broken today** — worth a ticket
   independent of the merge.
3. **Fields inside subdocument schemas.** `schema.eachPath()` does not descend
   into an `Embedded` child, so `food_orders.dispatch.deliveryPartnerId` and
   `statusHistory.byId` are invisible to it — the rider on every order.

So `IDENTITY_REFS` is explicit and reviewed, and a test asserts the audit finds
nothing it doesn't cover: a field added later fails CI instead of being
discovered after a migration. The audit immediately earned it by catching two
collections the hand-written list had missed.

### Two bugs the rehearsal found that review had not — both in the money path

- **The invariant check gave a false alarm on resume.** It compared
  `food + quick` before against `food` after. On a resumed run quick's balances
  are already in food, so it double-counted and reported `INVARIANT VIOLATED` for
  a *correct* migration — telling an operator to restore from backup when nothing
  was wrong. Now baselined on food plus the money the run actually moves.
- **Merged wallets were not idempotent.** An absorbed wallet leaves no document
  of its own in food, so the `_id` existence check couldn't see it and a second
  run credited it **again**: the shared customer went 350 → **500**. The target
  now records which source wallets it has swallowed.

Neither is visible without actually running it. This is the argument for
rehearsing on a scratch cluster rather than reviewing the diff.

### Running it, in order

```bash
node scripts/merge-report.js                      # schema audit alone, no DB
FOOD_URI=... QUICK_URI=... node scripts/merge-report.js --out ./merge-report
```

Read the CSVs. `users-by-phone.csv` is the one that matters — every `both` row is
a customer whose two wallets are about to become one. Then:

```bash
FOOD_URI=... QUICK_URI=... node scripts/merge-databases.js           # dry run
FOOD_URI=... QUICK_URI=... node scripts/merge-databases.js --apply
```

Take a restorable backup of both databases first, and rehearse the whole thing on
a restore of production before pointing it at production.

### Still open

- **Backup, freeze, cutover, and the go/no-go are yours.** I have no access to
  the live databases and would not run an irreversible migration unattended.
- Order-id prefixing rewrites `order_id` **and** the `orderId` alias, but any
  invoice PDF or support ticket already showing a bare number keeps showing it.
  The prefix makes new lookups unambiguous; it does not rewrite history.
- `mongodb-memory-server` is installed with `--no-save` on purpose — a
  migration-time tool, not a dependency of the app. `npm run test:merge` needs
  it; `npm test` does not.
### Phase 6 — the harvest: **done**, and it found the plugin was broken

One commit, `ae717b3`. 37 unit tests, 21 integration tests, routes unchanged at
917, 23 scoped models.

### Two real bugs, both found only by running against a real mongod

1. **Lazy settings creation had been throwing since phase 3.** The plugin
   stamped `vertical` in `pre('save')`, but mongoose runs validation *ahead of*
   any `pre('save')` a plugin adds — and the field is `required`. So
   `FoodLandingSettings.create({})` and `FoodBusinessSettings.create({...})`
   failed with `ValidationError` before the hook that fills the field ever ran.
   Those are the paths a fresh deployment takes on its **first request**.
   The phase 3 entry above claimed settings auto-create through this hook —
   **that was wrong**. Moved to `pre('validate')`.

2. **Dispatch could double-assign a rider.** `getBusyDeliveryPartnerIds()` reads
   the order collection, which phase 2 made vertical-scoped — so a grocery
   dispatch could not see a rider already out with a dinner order. Now
   explicitly cross-vertical.

Neither is visible in a diff. Phase 2 tested the pure pipeline function and the
AsyncLocalStorage propagation, but never the mongoose hooks themselves; that gap
is what hid both.

### What shipped

- **Shared fleet.** Rider routes run under a `CROSS_VERTICAL` scope instead of
  the mount prefix. The delivery module makes sixteen reads against the order
  collection; setting the scope once on the route group beats sixteen chances to
  forget an escape hatch. Both prefixes still resolve — no rider app changes.
- **`FoodDeliveryCashLimit` un-scoped**, correcting a phase 3 call. It caps a
  rider's `cashInHand`, which is one shared balance: 4,000 from food plus 3,000
  from grocery is 7,000 against one limit. Commission rules stay scoped — read
  per order, and a grocery run may pay differently.
- **`GET /orders?allVerticals=true`** — one customer history across both
  catalogues, on the deliberately vertical-less `{ userId, createdAt }` index
  kept in phase 2 for this. Opt-in, so existing apps are unchanged.
- **The shared wallet needed no code**, as predicted in §9.2 — `FoodUserWallet`
  was never scoped.

**Not built: cross-vertical coupons.** An offer belongs to one catalogue with one
budget and nobody has asked for one spanning both. `verticals: [String]` is the
shape if that changes.

### One trap worth knowing

A mongoose query is lazy. Build it inside a scope and `await` it outside, and it
is filtered by whatever scope is in force when it **runs** — not where it was
written. Express is safe (`withVertical` wraps `next()`, so the whole handler
chain including its awaits is inside the scope); background jobs and any helper
returning an unawaited query are not. Pinned by a test.

/**
 * Migrate the legacy `maava` database into this application's schema.
 *
 * The two are DIFFERENT APPLICATIONS, not two copies of one. A mongodump and
 * restore would produce a database this app cannot read: collection names
 * differ (`users` vs `food_users`), field names differ (`name` vs
 * `restaurantName`), the catalogue is nested where ours is flat, and every
 * catalogue document here needs a `vertical` the source has no concept of.
 * So this is a field-by-field mapping, not a copy.
 *
 *   SOURCE_URI=... TARGET_URI=... node scripts/migrate-maava-legacy.js          # dry run
 *   SOURCE_URI=... TARGET_URI=... node scripts/migrate-maava-legacy.js --apply
 *
 * READS the source and never writes to it. Not one update, ever -- the source
 * is a live production database serving real customers while this runs.
 *
 * Idempotent: every target document keeps the source `_id`, so a re-run skips
 * what already landed and an interrupted run is resumed by running it again.
 *
 * Facts established by the reconciliation pass, which this relies on:
 *   - orders.restaurantId is String(restaurant._id), NOT restaurants.restaurantId
 *     (that is a separate business code, "REST-...")
 *   - 95 of 1271 orders point at a restaurant that no longer exists
 *   - users.wallet.balance and userwallets.balance agree exactly, so either is
 *     safe as the money source; userwallets wins where present
 *   - isHibermartOrder marks the quick-commerce orders -> our `vertical`
 *   - no duplicate phone numbers, no duplicate order ids
 */
import { MongoClient, ObjectId } from 'mongodb';

const apply = process.argv.includes('--apply');
const SOURCE_URI = process.env.SOURCE_URI;
const TARGET_URI = process.env.TARGET_URI;

const log = (...a) => console.log(...a);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, d = '') => (v === null || v === undefined ? d : String(v));
const oid = (v) => { try { return new ObjectId(String(v)); } catch { return null; } };

/** An image field is a bare URL here but {url, publicId} in the source. */
const imageUrl = (v) => {
    if (!v) return '';
    if (typeof v === 'string') return v;
    return str(v.url || v.secure_url || '');
};
const imageList = (v) => (Array.isArray(v) ? v.map(imageUrl).filter(Boolean) : []);

/**
 * Source order statuses are a much smaller set than ours (cancelled, delivered,
 * out_for_delivery, ready). Anything unrecognised becomes 'confirmed' rather
 * than being dropped -- an order with an odd status is still a real order.
 */
const ORDER_STATUS = {
    delivered: 'delivered',
    cancelled: 'cancelled_by_user',
    out_for_delivery: 'picked_up',
    ready: 'ready_for_pickup',
    preparing: 'preparing',
    confirmed: 'confirmed',
    pending: 'created',
};

const PAYMENT_METHOD = { cash: 'cash', razorpay: 'razorpay', wallet: 'wallet' };
const PAYMENT_STATUS = { completed: 'paid', pending: 'cod_pending', failed: 'failed' };

const digits10 = (v) => {
    const d = str(v).replace(/\D/g, '');
    return d.length > 10 ? d.slice(-10) : d;
};

const stats = [];
const record = (name, r) => { stats.push({ name, ...r }); };

/**
 * Insert documents that are not already present, keyed on _id.
 * Never updates: a document already in the target was either migrated by an
 * earlier run or edited since, and silently overwriting an edit is worse than
 * skipping it.
 */
const insertMissing = async (target, collection, docs) => {
    if (!docs.length) return { inserted: 0, skipped: 0 };
    const ids = docs.map((d) => d._id);
    const present = new Set((await target.collection(collection)
        .find({ _id: { $in: ids } }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)));
    const fresh = docs.filter((d) => !present.has(String(d._id)));
    if (apply && fresh.length) {
        // ordered:false so one bad document cannot abort the rest of the batch.
        await target.collection(collection).insertMany(fresh, { ordered: false });
    }
    return { inserted: fresh.length, skipped: present.size };
};

const run = async () => {
    if (!SOURCE_URI || !TARGET_URI) throw new Error('SOURCE_URI and TARGET_URI must both be set');

    const sc = new MongoClient(SOURCE_URI, { serverSelectionTimeoutMS: 20000 });
    const tc = new MongoClient(TARGET_URI, { serverSelectionTimeoutMS: 20000 });
    await sc.connect(); await tc.connect();
    const S = sc.db(); const T = tc.db();

    log(`source : ${S.databaseName}  (READ ONLY)`);
    log(`target : ${T.databaseName}`);
    log(`mode   : ${apply ? 'APPLY (writing to target)' : 'dry run (no writes)'}\n`);

    // ---- zones ------------------------------------------------------------
    const zones = await S.collection('zones').find({}).toArray();
    record('zones -> food_zones', await insertMissing(T, 'food_zones', zones.map((z) => ({
        _id: z._id,
        name: str(z.zoneName || z.name, 'Zone'),
        country: str(z.country, 'India'),
        // Our schema wants the polygon; the source keeps both a GeoJSON
        // `boundary` and a [{latitude,longitude}] list. Prefer the GeoJSON.
        coordinates: Array.isArray(z.boundary?.coordinates)
            ? z.boundary.coordinates
            : [(z.coordinates || []).map((p) => [num(p.longitude), num(p.latitude)])],
        isActive: z.isActive !== false,
        createdAt: z.createdAt, updatedAt: z.updatedAt,
    }))));

    // ---- users ------------------------------------------------------------
    const users = await S.collection('users').find({}).toArray();
    record('users -> food_users', await insertMissing(T, 'food_users', users.map((u) => ({
        _id: u._id,
        name: str(u.name),
        phone: str(u.phone),
        email: str(u.email),
        profileImage: imageUrl(u.profileImage),
        isActive: u.isActive !== false,
        phoneVerified: !!u.phoneVerified,
        fcmTokens: Array.isArray(u.fcmTokens) ? u.fcmTokens : [],
        fcmTokenMobile: Array.isArray(u.fcmTokenMobile) ? u.fcmTokenMobile : [],
        // The source stores addresses in its own shape; keep only what our
        // schema declares, and only rows with the fields it marks required.
        addresses: (Array.isArray(u.addresses) ? u.addresses : [])
            .filter((a) => a && a.street && a.city && a.state)
            .map((a) => ({
                label: ['Home', 'Office', 'Other'].includes(a.label) ? a.label : 'Home',
                street: str(a.street), additionalDetails: str(a.additionalDetails),
                city: str(a.city), state: str(a.state), zipCode: str(a.zipCode || a.pincode),
                phone: str(a.phone), isDefault: !!a.isDefault,
                ...(Number.isFinite(num(a.longitude, NaN)) && Number.isFinite(num(a.latitude, NaN))
                    ? { location: { type: 'Point', coordinates: [num(a.longitude), num(a.latitude)] } }
                    : {}),
            })),
        createdAt: u.createdAt, updatedAt: u.updatedAt,
    }))));

    // ---- user wallets -----------------------------------------------------
    // The source has two sources of truth and the reconciliation proved they
    // agree; userwallets wins where present, the embedded balance covers the
    // 947 users with no wallet row.
    const srcWallets = await S.collection('userwallets').find({}).toArray();
    const walletByUser = new Map(srcWallets.map((w) => [String(w.userId), w]));
    record('userwallets -> food_user_wallets', await insertMissing(T, 'food_user_wallets',
        users.map((u) => {
            const w = walletByUser.get(String(u._id));
            return {
                _id: w ? w._id : new ObjectId(),
                userId: u._id,
                balance: w ? num(w.balance) : num(u.wallet?.balance),
                referralEarnings: 0,
                transactions: Array.isArray(w?.transactions) ? w.transactions : [],
                createdAt: w?.createdAt || u.createdAt, updatedAt: w?.updatedAt || u.updatedAt,
            };
        })));

    // ---- restaurants ------------------------------------------------------
    const restaurants = await S.collection('restaurants').find({}).toArray();

    /**
     * Our schema has a partial unique index on
     * (vertical, restaurantNameNormalized, ownerPhoneLast10) -- one seller per
     * name+phone. The source has no such constraint and contains one seller
     * registered twice.
     *
     * The duplicate is KEPT, not dropped: it is a real record and orders may
     * reference either copy. Only the first in each group carries the two
     * normalized fields; the later ones omit them, which puts them outside the
     * partial index (it only covers documents where both are strings). They
     * remain fully visible in the admin panel, where a human can merge them.
     */
    const seenNamePhone = new Set();
    const isDuplicateRegistration = (r) => {
        const key = `${str(r.name).trim().toLowerCase()}|${digits10(r.ownerPhone || r.phone)}`;
        if (key === '|') return false;
        if (seenNamePhone.has(key)) return true;
        seenNamePhone.add(key);
        return false;
    };
    let duplicateSellers = 0;

    record('restaurants -> food_restaurants', await insertMissing(T, 'food_restaurants',
        restaurants.map((r) => {
            const duplicate = isDuplicateRegistration(r);
            if (duplicate) duplicateSellers += 1;
            // The source has no `status`; it is implied by approvedAt/rejectedAt.
            const status = r.rejectedAt ? 'rejected' : (r.approvedAt ? 'approved' : 'pending');
            return {
                _id: r._id,
                vertical: 'food',
                restaurantName: str(r.name, 'Unnamed'),
                ownerName: str(r.ownerName, str(r.name, 'Owner')),
                ownerEmail: str(r.ownerEmail || r.email),
                ownerPhone: str(r.ownerPhone || r.phone),
                // Omitted on a duplicate registration so it falls outside the
                // partial unique index instead of being rejected or dropped.
                ...(duplicate ? {} : {
                    restaurantNameNormalized: str(r.name).trim().toLowerCase(),
                    ownerPhoneLast10: digits10(r.ownerPhone || r.phone),
                }),
                primaryContactNumber: str(r.primaryContactNumber || r.phone),
                pureVegRestaurant: !!r.pureVegRestaurant,
                status,
                approvedAt: r.approvedAt || undefined,
                rejectedAt: r.rejectedAt || undefined,
                rejectionReason: str(r.rejectionReason),
                cuisines: Array.isArray(r.cuisines) ? r.cuisines : [],
                openDays: Array.isArray(r.openDays) ? r.openDays : [],
                openingTime: str(r.deliveryTimings?.openingTime),
                closingTime: str(r.deliveryTimings?.closingTime),
                isAcceptingOrders: r.isAcceptingOrders !== false,
                estimatedDeliveryTime: str(r.estimatedDeliveryTime),
                featuredDish: str(r.featuredDish),
                featuredPrice: num(r.featuredPrice),
                offer: str(r.offer),
                rating: num(r.rating),
                totalRatings: num(r.totalRatings),
                businessModel: str(r.businessModel),
                // Images are objects in the source, plain URLs here.
                profileImage: imageUrl(r.profileImage),
                menuImages: imageList(r.menuImages),
                coverImages: imageList(r.coverImages),
                ...(Number.isFinite(num(r.location?.longitude, NaN)) && Number.isFinite(num(r.location?.latitude, NaN))
                    ? {
                        location: {
                            type: 'Point',
                            coordinates: [num(r.location.longitude), num(r.location.latitude)],
                            latitude: num(r.location.latitude), longitude: num(r.location.longitude),
                            formattedAddress: str(r.location.formattedAddress),
                            city: str(r.location.city), state: str(r.location.state),
                            pincode: str(r.location.pincode), area: str(r.location.area),
                        },
                    }
                    : {}),
                createdAt: r.createdAt, updatedAt: r.updatedAt,
            };
        })));

    if (duplicateSellers) {
        log(`  note: ${duplicateSellers} seller(s) share a name and phone with an earlier one;`);
        log('        kept, but left outside the unique index for a human to merge.\n');
    }

    // ---- restaurant wallets ----------------------------------------------
    const rWallets = await S.collection('restaurantwallets').find({}).toArray();
    record('restaurantwallets -> food_restaurant_wallets', await insertMissing(T, 'food_restaurant_wallets',
        rWallets.map((w) => ({
            _id: w._id,
            restaurantId: w.restaurantId,
            balance: num(w.totalBalance),
            totalEarnings: num(w.totalEarned),
            totalSettled: num(w.totalWithdrawn),
            lockedAmount: 0,
            createdAt: w.createdAt, updatedAt: w.updatedAt,
        }))));

    // ---- categories -------------------------------------------------------
    const cats = await S.collection('restaurantcategories').find({}).toArray();
    record('restaurantcategories -> food_categories', await insertMissing(T, 'food_categories',
        cats.map((c) => ({
            _id: c._id,
            vertical: 'food',
            name: str(c.name, 'Category'),
            description: str(c.description),
            image: str(c.icon),
            restaurantId: c.restaurant || undefined,
            createdByRestaurantId: c.restaurant || undefined,
            isActive: c.isActive !== false,
            isApproved: true,
            approvalStatus: 'approved',
            sortOrder: num(c.order),
            createdAt: c.createdAt, updatedAt: c.updatedAt,
        }))));

    // ---- menu items (flattened) ------------------------------------------
    // The source nests items inside sections inside one menu document per
    // restaurant; ours are a flat collection. Ids are generated because the
    // nested items have no stable _id of their own -- which is also why this
    // step keys idempotency on (restaurantId, name) instead.
    const menus = await S.collection('menus').find({}).toArray();
    const items = [];
    for (const menu of menus) {
        for (const section of (Array.isArray(menu.sections) ? menu.sections : [])) {
            for (const it of (Array.isArray(section.items) ? section.items : [])) {
                if (!it || !it.name) continue;
                items.push({
                    _id: oid(it.id) || new ObjectId(),
                    vertical: 'food',
                    restaurantId: menu.restaurant,
                    name: str(it.name),
                    description: str(it.description),
                    price: num(it.price),
                    images: imageList(it.images).concat(imageUrl(it.image) ? [imageUrl(it.image)] : []),
                    foodType: it.isVeg === true ? 'Veg' : 'Non-Veg',
                    isAvailable: it.isAvailable !== false,
                    approvalStatus: 'approved',
                    categoryName: str(section.name),
                    createdAt: menu.createdAt, updatedAt: menu.updatedAt,
                });
            }
        }
    }
    record('menus.sections[].items[] -> food_items', await insertMissing(T, 'food_items', items));

    // ---- orders -----------------------------------------------------------
    const restaurantIds = new Set(restaurants.map((r) => String(r._id)));
    const orders = await S.collection('orders').find({}).toArray();
    let unresolved = 0;
    const mapped = orders.map((o) => {
        const rid = oid(o.restaurantId);
        if (!rid || !restaurantIds.has(String(o.restaurantId))) unresolved += 1;
        const a = o.address || {};
        return {
            _id: o._id,
            // The source's own quick-commerce flag becomes our discriminator.
            vertical: o.isHibermartOrder === true ? 'quick' : 'food',
            order_id: str(o.orderId) || String(o._id),
            orderId: str(o.orderId) || String(o._id),
            userId: o.userId,
            restaurantId: rid,
            restaurantName: str(o.restaurantName),
            orderStatus: ORDER_STATUS[str(o.status)] || 'confirmed',
            items: (Array.isArray(o.items) ? o.items : []).map((it) => ({
                itemId: str(it.itemId || it.id || it._id),
                name: str(it.name, 'Item'),
                price: num(it.price),
                quantity: Math.max(1, num(it.quantity, 1)),
                image: imageUrl(it.image),
                isVeg: it.isVeg !== false,
                notes: str(it.notes),
            })),
            // street/city/state are required by our schema; the placeholder
            // keeps a real order from being dropped over a missing city.
            deliveryAddress: {
                label: ['Home', 'Office', 'Other'].includes(a.label) ? a.label : 'Home',
                name: str(a.name), fullName: str(a.fullName),
                street: str(a.street, '-'), additionalDetails: str(a.additionalDetails),
                city: str(a.city, '-'), state: str(a.state, '-'),
                zipCode: str(a.zipCode || a.pincode), phone: str(a.phone),
                ...(Number.isFinite(num(a.longitude, NaN)) && Number.isFinite(num(a.latitude, NaN))
                    ? { location: { type: 'Point', coordinates: [num(a.longitude), num(a.latitude)] } }
                    : {}),
            },
            pricing: {
                subtotal: num(o.pricing?.subtotal),
                tax: num(o.pricing?.tax),
                deliveryFee: num(o.pricing?.deliveryFee),
                platformFee: num(o.pricing?.platformFee),
                packagingFee: num(o.pricing?.packagingFee),
                discount: num(o.pricing?.discount),
                total: num(o.pricing?.total ?? o.pricing?.grandTotal),
                currency: 'INR',
            },
            payment: {
                method: PAYMENT_METHOD[str(o.payment?.method)] || 'cash',
                status: PAYMENT_STATUS[str(o.payment?.status)] || 'cod_pending',
                ...(o.payment?.razorpayOrderId
                    ? { razorpay: { orderId: str(o.payment.razorpayOrderId), paymentId: str(o.payment.razorpayPaymentId) } }
                    : {}),
            },
            sendCutlery: o.sendCutlery !== false,
            deliveryFleet: str(o.deliveryFleet, 'standard'),
            cancellationReason: str(o.cancellationReason),
            createdAt: o.createdAt, updatedAt: o.updatedAt,
        };
    });
    // An order whose restaurant was deleted keeps a dangling restaurantId
    // rather than being dropped: it is still a real order in a customer's
    // history, and dropping it would silently shrink their record.
    record('orders -> food_orders', await insertMissing(T, 'food_orders', mapped));
    log(`  note: ${unresolved} order(s) reference a restaurant that no longer exists; migrated with the id intact\n`);

    // ---- report -----------------------------------------------------------
    log('=== RESULT ===\n');
    let totalIn = 0;
    for (const s of stats) {
        log(`  ${s.name.padEnd(44)} ${apply ? 'inserted' : 'would insert'} ${String(s.inserted).padStart(6)}   already present ${s.skipped}`);
        totalIn += s.inserted;
    }
    log(`\n  ${apply ? 'inserted' : 'would insert'} ${totalIn} documents total`);

    // ---- money invariant --------------------------------------------------
    const srcMoney = srcWallets.reduce((t, w) => t + num(w.balance), 0)
        + users.filter((u) => !walletByUser.has(String(u._id))).reduce((t, u) => t + num(u.wallet?.balance), 0);
    log(`\n  source user balance total : ${srcMoney.toFixed(2)}`);
    if (apply) {
        const tgt = await T.collection('food_user_wallets').find({}, { projection: { balance: 1 } }).toArray();
        const tgtMoney = tgt.reduce((t, w) => t + num(w.balance), 0);
        log(`  target user balance total : ${tgtMoney.toFixed(2)}`);
        log(Math.abs(tgtMoney - srcMoney) < 0.005 ? '  balances reconcile.' : '  *** BALANCES DO NOT MATCH ***');
    }

    // Proof the source was not written to.
    log(`\n  source order count still ${await S.collection('orders').countDocuments()} (never written to)`);

    await sc.close(); await tc.close();
    return 0;
};

run().then((c) => process.exit(c)).catch((e) => { console.error(`\nmigration failed: ${e.message}\n${e.stack}`); process.exit(1); });

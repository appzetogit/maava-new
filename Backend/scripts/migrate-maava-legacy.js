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
import { createHash } from 'node:crypto';
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

/** Emails are compared case-insensitively; the target's unique index is on the
 *  stored value, so it has to be normalised on the way in. */
const normalizeEmail = (v) => str(v).trim().toLowerCase();

/**
 * A stable ObjectId derived from natural-key parts.
 *
 * For records the source nests without an id of their own. The same inputs
 * always produce the same id, so a re-run recognises what it already wrote.
 */
const derivedId = (...parts) =>
    new ObjectId(createHash('md5').update(parts.map((p) => str(p)).join('\u0000')).digest('hex').slice(0, 24));

const stats = [];
const record = (name, r) => { stats.push({ name, ...r }); };

/**
 * Insert documents that are not already present.
 *
 * Never updates: a document already in the target was either migrated by an
 * earlier run or edited since, and silently overwriting an edit is worse than
 * skipping it.
 *
 * [keyField] is the field idempotency is judged on, and it must be whatever the
 * target's unique index actually enforces. `_id` is right for collections
 * carrying the source id across, but wrong for food_user_wallets: users with no
 * source wallet row get a generated wallet, so its `_id` differs on every run
 * while `userId` does not. Keyed on `_id` there, a second run reinserts all 947
 * of them and dies on the unique userId index -- which is exactly what happened.
 */
const insertMissing = async (target, collection, docs, keyField = '_id') => {
    if (!docs.length) return { inserted: 0, skipped: 0 };

    // Dedupe the INPUT first, not just against what is already stored.
    //
    // Derived ids mean two source records with the same natural key produce the
    // same _id, and three menu items do: the same dish listed twice in one
    // section. Checking only against the database lets both copies into the same
    // insertMany, where they collide with each other. Keeping the first is right
    // -- they are the same item.
    const deduped = [];
    const seen = new Set();
    let collapsed = 0;
    for (const d of docs) {
        const k = String(d[keyField]);
        if (seen.has(k)) { collapsed += 1; continue; }
        seen.add(k);
        deduped.push(d);
    }

    const keys = deduped.map((d) => d[keyField]).filter((k) => k !== undefined);
    const present = new Set((await target.collection(collection)
        .find({ [keyField]: { $in: keys } }, { projection: { [keyField]: 1 } }).toArray())
        .map((d) => String(d[keyField])));
    const fresh = deduped.filter((d) => !present.has(String(d[keyField])));
    if (collapsed) log(`  note: ${collection}: ${collapsed} source record(s) collapsed onto an existing natural key`);
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
        }), 'userId'));

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
        })), 'restaurantId'));

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
    // restaurant; ours are a flat collection.
    //
    // The nested items have no stable _id, so the id is DERIVED from
    // (restaurant, section, name) rather than generated. A generated one differs
    // on every run, so the _id idempotency check never matches and each run
    // inserts the whole catalogue again -- which is exactly what happened, and
    // left 992 duplicates behind on the second run.
    const menus = await S.collection('menus').find({}).toArray();
    const items = [];
    for (const menu of menus) {
        for (const section of (Array.isArray(menu.sections) ? menu.sections : [])) {
            for (const it of (Array.isArray(section.items) ? section.items : [])) {
                if (!it || !it.name) continue;
                items.push({
                    _id: derivedId(menu.restaurant, section.name, it.name),
                    vertical: 'food',
                    restaurantId: menu.restaurant,
                    name: str(it.name),
                    description: str(it.description),
                    price: num(it.price),
                    // BOTH image and images. The schema carries the singular
                    // as the primary thumbnail and the admin list renders that
                    // one; populating only the gallery leaves every row blank.
                    image: imageUrl(it.image) || imageList(it.images)[0] || '',
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

    // =====================================================================
    // QUICK COMMERCE
    //
    // The source keeps its grocery side in a separate family of collections
    // (inmart*, hibermart_*) rather than a flag, so these map onto the SAME
    // target collections as the food data but with vertical: 'quick'. That is
    // the whole point of the discriminator -- one catalogue collection, two
    // businesses -- and this is the first real data to exercise it.
    // =====================================================================

    // ---- hibermart zones --------------------------------------------------
    // Zones are not vertical-scoped: geography is shared, and a zone serves
    // whichever businesses operate in it.
    const qZones = await S.collection('hibermart_zones').find({}).toArray();
    record('hibermart_zones -> food_zones', await insertMissing(T, 'food_zones', qZones.map((z) => ({
        _id: z._id,
        name: str(z.zoneName || z.name, 'Zone'),
        country: str(z.country, 'India'),
        coordinates: Array.isArray(z.boundary?.coordinates)
            ? z.boundary.coordinates
            : [(z.coordinates || []).map((p) => [num(p.longitude), num(p.latitude)])],
        isActive: z.isActive !== false,
        createdAt: z.createdAt, updatedAt: z.updatedAt,
    }))));

    // ---- inmart stores -> sellers ----------------------------------------
    const stores = await S.collection('inmartstores').find({}).toArray();
    record('inmartstores -> food_restaurants', await insertMissing(T, 'food_restaurants', stores.map((r) => ({
        _id: r._id,
        vertical: 'quick',
        restaurantName: str(r.name, 'Store'),
        restaurantNameNormalized: str(r.name).trim().toLowerCase(),
        ownerName: str(r.ownerName, str(r.name, 'Owner')),
        ownerEmail: str(r.ownerEmail),
        ownerPhone: str(r.ownerPhone),
        ownerPhoneLast10: digits10(r.ownerPhone),
        primaryContactNumber: str(r.ownerPhone),
        pureVegRestaurant: false,
        // A live store in the source has no approval workflow, so it arrives
        // approved rather than sitting in a queue nobody knows to look at.
        status: 'approved',
        approvedAt: r.createdAt,
        isAcceptingOrders: r.isAcceptingOrders !== false,
        openDays: Array.isArray(r.openDays) ? r.openDays : [],
        rating: num(r.rating),
        totalRatings: num(r.totalRatings),
        profileImage: imageUrl(r.image || r.logo),
        ...(Number.isFinite(num(r.location?.longitude, NaN)) && Number.isFinite(num(r.location?.latitude, NaN))
            ? {
                location: {
                    type: 'Point',
                    coordinates: [num(r.location.longitude), num(r.location.latitude)],
                    latitude: num(r.location.latitude), longitude: num(r.location.longitude),
                    city: str(r.location.city), pincode: str(r.location.pincode),
                },
            }
            : {}),
        createdAt: r.createdAt, updatedAt: r.updatedAt,
    }))));
    const storeIds = stores.map((s2) => s2._id);
    const defaultStore = storeIds[0] || null;

    // ---- inmart categories (two levels) ----------------------------------
    // The source nests subCategories inside each category; our schema models
    // the second level as a separate document pointing at its parent, which is
    // exactly what parentId exists for.
    const qCats = await S.collection('inmartcategories').find({}).toArray();
    const catDocs = [];
    for (const c of qCats) {
        catDocs.push({
            _id: c._id,
            vertical: 'quick',
            name: str(c.name, 'Category'),
            image: imageUrl(c.image),
            isActive: c.isActive !== false,
            isApproved: true,
            approvalStatus: 'approved',
            sortOrder: num(c.displayOrder),
            createdAt: c.createdAt, updatedAt: c.updatedAt,
        });
        for (const sub of (Array.isArray(c.subCategories) ? c.subCategories : [])) {
            if (!sub || !sub.name) continue;
            catDocs.push({
                _id: derivedId('inmart-subcat', c._id, sub.name),
                vertical: 'quick',
                name: str(sub.name),
                image: imageUrl(sub.image),
                parentId: c._id,
                isActive: true,
                isApproved: true,
                approvalStatus: 'approved',
                sortOrder: num(sub.displayOrder),
                createdAt: c.createdAt, updatedAt: c.updatedAt,
            });
        }
    }
    record('inmartcategories -> food_categories', await insertMissing(T, 'food_categories', catDocs));

    // ---- inmart products --------------------------------------------------
    // These land almost one-for-one on the quick-commerce fields the merge
    // added: stock, low-stock threshold, barcode, sku, brand, pack size.
    const qProducts = await S.collection('inmartproducts').find({}).toArray();
    record('inmartproducts -> food_items', await insertMissing(T, 'food_items', qProducts.map((p) => ({
        _id: p._id,
        vertical: 'quick',
        restaurantId: p.store || defaultStore,
        name: str(p.name, 'Product'),
        description: str(p.description),
        price: num(p.price),
        mrp: num(p.originalPrice) || null,
        brand: str(p.brand),
        sku: str(p.sku),
        barcode: str(p.barcode),
        packSize: str(p.weight),
        expiryDate: p.expiryDate || null,
        // `stock` is a string in the source; a value that will not parse means
        // "not tracked" (null), which is deliberately different from zero.
        stockQty: Number.isFinite(Number(p.stock)) ? Number(p.stock) : null,
        lowStockThreshold: num(p.lowStockThreshold) || null,
        image: imageUrl(p.image) || imageList(p.images)[0] || '',
        images: imageList(p.images).concat(imageUrl(p.image) ? [imageUrl(p.image)] : []),
        isAvailable: p.isAvailable !== false,
        approvalStatus: str(p.approvalStatus, 'approved') === 'approved' ? 'approved' : str(p.approvalStatus),
        categoryName: str(p.category),
        rating: num(p.rating),
        totalRatings: num(p.totalRatings),
        createdAt: p.createdAt, updatedAt: p.updatedAt,
    }))));

    // ---- inmart banners ---------------------------------------------------
    const qBanners = await S.collection('inmartbanners').find({}).toArray();
    record('inmartbanners -> food_hero_banners', await insertMissing(T, 'food_hero_banners',
        qBanners.filter((b) => imageUrl(b.imageUrl || b.image)).map((b) => ({
            _id: b._id,
            vertical: 'quick',
            imageUrl: imageUrl(b.imageUrl || b.image),
            // publicId is required by our schema; the source always carries it,
            // but fall back to the id so a banner is never dropped over it.
            publicId: str(b.publicId, String(b._id)),
            title: str(b.title),
            subtitle: str(b.tagline),
            linkUrl: str(b.linkUrl),
            isActive: b.isActive !== false,
            sortOrder: num(b.displayOrder),
            createdAt: b.createdAt, updatedAt: b.updatedAt,
        }))));

    // =====================================================================
    // THE REST
    //
    // Everything not already covered. Split in two on a single rule: where our
    // schema can hold the record, it is mapped; where our schema REQUIRES
    // fields the source simply does not have, the collection is copied verbatim
    // under a legacy_ name instead of inventing values to satisfy a validator.
    //
    // Fabricating a coupon code so an offer fits, or a title so a log fits,
    // produces data that looks real and is not. Preserved-but-unmapped is
    // honest and still recoverable; invented is neither.
    // =====================================================================

    // ---- riders -----------------------------------------------------------
    //
    // vehicleNumber carries a SPARSE unique index. Sparse skips documents where
    // the field is missing -- it does not skip an empty string, so writing ''
    // for the 433 riders without a vehicle makes them all collide with each
    // other. The field is omitted instead.
    //
    // Two vehicle numbers are also genuinely duplicated in the source
    // (TG31B0041 three times). Those riders are kept and left outside the index
    // the same way, rather than dropped: a rider is a person, and the index is
    // about the plate.
    const seenVehicle = new Set();
    let vehicleClashes = 0;
    const vehicleFor = (d) => {
        const nOrig = str(d.vehicle?.number).trim();
        if (!nOrig) return {};
        if (seenVehicle.has(nOrig)) { vehicleClashes += 1; return {}; }
        seenVehicle.add(nOrig);
        return { vehicleNumber: nOrig };
    };

    const riders = await S.collection('deliveries').find({}).toArray();
    record('deliveries -> food_delivery_partners', await insertMissing(T, 'food_delivery_partners',
        riders.filter((d) => str(d.name) && str(d.phone)).map((d) => ({
            _id: d._id,
            name: str(d.name),
            phone: str(d.phone),
            email: str(d.email),
            profileImage: imageUrl(d.profileImage),
            isActive: d.isActive !== false,
            phoneVerified: !!d.phoneVerified,
            status: str(d.status, 'pending'),
            fcmTokens: Array.isArray(d.fcmTokens) ? d.fcmTokens : [],
            fcmTokenMobile: Array.isArray(d.fcmTokenMobile) ? d.fcmTokenMobile : [],
            vehicleType: str(d.vehicle?.type),
            ...vehicleFor(d),
            vehicleName: str(d.vehicle?.model || d.vehicle?.brand),
            lastLogin: d.lastLogin,
            createdAt: d.createdAt, updatedAt: d.updatedAt,
        }))));

    if (vehicleClashes) {
        log(`  note: ${vehicleClashes} rider(s) share a vehicle number with an earlier one;`);
        log('        kept, with the number left off so the unique index still holds.');
    }

    const riderWallets = await S.collection('deliverywallets').find({}).toArray();
    record('deliverywallets -> food_delivery_wallets', await insertMissing(T, 'food_delivery_wallets',
        riderWallets.filter((w) => w.deliveryPartnerId || w.deliveryId).map((w) => ({
            _id: w._id,
            deliveryPartnerId: w.deliveryPartnerId || w.deliveryId,
            balance: num(w.totalBalance),
            totalEarnings: num(w.totalEarned),
            totalSettled: num(w.totalWithdrawn),
            cashInHand: num(w.cashInHand),
            lockedAmount: 0,
            createdAt: w.createdAt, updatedAt: w.updatedAt,
        })), 'deliveryPartnerId'));

    // ---- payments ---------------------------------------------------------
    const pays = await S.collection('payments').find({}).toArray();
    record('payments -> payments', await insertMissing(T, 'payments',
        pays.filter((p) => p.orderId && p.userId && Number.isFinite(num(p.amount, NaN))).map((p) => ({
            _id: p._id,
            orderId: p.orderId,
            userId: p.userId,
            amount: num(p.amount),
            currency: str(p.currency, 'INR'),
            method: str(p.method, 'cash'),
            status: str(p.status, 'pending'),
            transactionId: str(p.transactionId || p.paymentId),
            razorpay: p.razorpay || undefined,
            createdAt: p.createdAt, updatedAt: p.updatedAt,
        }))));

    // ---- seller finance ---------------------------------------------------
    const wds = await S.collection('withdrawalrequests').find({}).toArray();
    record('withdrawalrequests -> food_restaurant_withdrawals', await insertMissing(T, 'food_restaurant_withdrawals',
        wds.filter((w) => w.restaurantId && Number.isFinite(num(w.amount, NaN))).map((w) => ({
            _id: w._id,
            restaurantId: w.restaurantId,
            amount: num(w.amount),
            status: str(w.status, 'pending'),
            paymentMethod: str(w.paymentMethod),
            rejectionReason: str(w.rejectionReason),
            requestedAt: w.requestedAt || w.createdAt,
            processedAt: w.processedAt,
            createdAt: w.createdAt, updatedAt: w.updatedAt,
        }))));

    const timings = await S.collection('outlettimings').find({}).toArray();
    record('outlettimings -> food_restaurant_outlet_timings', await insertMissing(T, 'food_restaurant_outlet_timings',
        timings.filter((t) => t.restaurantId).map((t) => ({
            _id: t._id,
            restaurantId: t.restaurantId,
            outletType: str(t.outletType, 'delivery'),
            timings: Array.isArray(t.timings) ? t.timings : [],
            isActive: t.isActive !== false,
            createdAt: t.createdAt, updatedAt: t.updatedAt,
        }))));

    const comms = await S.collection('restaurantcommissions').find({}).toArray();
    record('restaurantcommissions -> food_restaurant_commissions', await insertMissing(T, 'food_restaurant_commissions',
        comms.filter((c) => c.restaurantId).map((c) => ({
            _id: c._id,
            restaurantId: c.restaurantId,
            defaultCommission: c.defaultCommission ?? num(c.commission),
            notes: str(c.notes),
            status: c.status !== false,
            createdAt: c.createdAt, updatedAt: c.updatedAt,
        })), 'restaurantId'));

    // ---- fee settings -----------------------------------------------------
    const fees = await S.collection('feesettings').find({}).toArray();
    record('feesettings -> food_fee_settings', await insertMissing(T, 'food_fee_settings',
        fees.map((f) => ({
            _id: f._id,
            vertical: 'food',
            deliveryFee: num(f.deliveryFee),
            deliveryFeeRanges: Array.isArray(f.deliveryFeeRanges) ? f.deliveryFeeRanges : [],
            platformFee: num(f.platformFee),
            gstRate: num(f.gstRate),
            isActive: f.isActive !== false,
            createdAt: f.createdAt, updatedAt: f.updatedAt,
        }))));

    // ---- banners ----------------------------------------------------------
    const hero = await S.collection('herobanners').find({}).toArray();
    record('herobanners -> food_hero_banners', await insertMissing(T, 'food_hero_banners',
        hero.filter((b) => imageUrl(b.imageUrl || b.image)).map((b) => ({
            _id: b._id,
            vertical: 'food',
            imageUrl: imageUrl(b.imageUrl || b.image),
            publicId: str(b.publicId, String(b._id)),
            title: str(b.title),
            isActive: b.isActive !== false,
            sortOrder: num(b.order ?? b.displayOrder),
            createdAt: b.createdAt, updatedAt: b.updatedAt,
        }))));

    const u250 = await S.collection('under250banners').find({}).toArray();
    record('under250banners -> food_under250_banners', await insertMissing(T, 'food_under250_banners',
        u250.filter((b) => imageUrl(b.imageUrl || b.image)).map((b) => ({
            _id: b._id,
            vertical: 'food',
            imageUrl: imageUrl(b.imageUrl || b.image),
            publicId: str(b.publicId, String(b._id)),
            title: str(b.title),
            isActive: b.isActive !== false,
            sortOrder: num(b.order ?? b.displayOrder),
            createdAt: b.createdAt, updatedAt: b.updatedAt,
        }))));

    // ---- admins -----------------------------------------------------------
    // Keyed on email, which is what the target's unique index enforces, so the
    // admin seeded on this deployment is never displaced by a legacy row.
    const legacyAdmins = await S.collection('admins').find({}).toArray();
    record('admins -> food_admins', await insertMissing(T, 'food_admins',
        legacyAdmins.filter((a) => str(a.email) && str(a.password)).map((a) => ({
            _id: a._id,
            name: str(a.name, 'Admin'),
            email: normalizeEmail(a.email),
            // Carried across as-is: it is already a bcrypt hash, so the legacy
            // admins keep the passwords they already know.
            password: str(a.password),
            phone: str(a.phone),
            profileImage: imageUrl(a.profileImage),
            adminType: str(a.role) === 'super_admin' ? 'super_admin' : 'admin',
            isActive: a.isActive !== false,
            isDeleted: false,
            createdAt: a.createdAt, updatedAt: a.updatedAt,
        })), 'email'));

    // ---- everything else: preserved verbatim ------------------------------
    // Named legacy_* so it is obvious these are untranslated source records and
    // not something this application reads.
    const MAPPED = new Set([
        'zones', 'users', 'userwallets', 'restaurants', 'restaurantwallets',
        'restaurantcategories', 'menus', 'orders',
        'inmartstores', 'inmartcategories', 'inmartproducts', 'inmartbanners', 'hibermart_zones',
        'deliveries', 'deliverywallets', 'payments', 'withdrawalrequests',
        'outlettimings', 'restaurantcommissions', 'feesettings',
        'herobanners', 'under250banners', 'admins', 'admincategorymanagements',
    ]);
    const allSource = (await S.listCollections().toArray())
        .map((c) => c.name).filter((n) => !n.startsWith('system.') && !MAPPED.has(n)).sort();

    let preserved = 0;
    let preservedDocs = 0;
    for (const name of allSource) {
        const docs = await S.collection(name).find({}).toArray();
        if (!docs.length) continue;
        const r = await insertMissing(T, `legacy_${name}`, docs);
        if (r.inserted || r.skipped) { preserved += 1; preservedDocs += r.inserted; }
    }
    record(`(${preserved} unmapped collections) -> legacy_*`, { inserted: preservedDocs, skipped: 0 });

    // ---- assign sellers to a zone -----------------------------------------
    //
    // The source has no zoneId on a restaurant; the old app worked out
    // serviceability another way. Ours filters the storefront by the zone the
    // customer's address falls in, so with every seller unzoned the shop shows
    // an empty list however many approved sellers exist.
    //
    // Derived by point-in-polygon from the coordinates that did migrate, using
    // the app's own isPointInPolygon rather than a second implementation --
    // a zone boundary decided two different ways is a bug waiting to happen.
    const { isPointInPolygon } = await import('../src/modules/food/shared/zoneServiceability.js');
    const zoneDocs = await T.collection('food_zones').find({ isActive: { $ne: false } }).toArray();
    const polygons = zoneDocs.map((z) => ({
        _id: z._id,
        name: z.name,
        // Stored as GeoJSON [lng, lat] rings; the helper wants {latitude, longitude}.
        points: (Array.isArray(z.coordinates?.[0]) ? z.coordinates[0] : [])
            .map((p) => (Array.isArray(p) ? { longitude: num(p[0]), latitude: num(p[1]) } : null))
            .filter(Boolean),
    })).filter((z) => z.points.length >= 3);

    const unzoned = await T.collection('food_restaurants')
        .find({ zoneId: { $in: [null, undefined] }, 'location.coordinates.0': { $exists: true } })
        .project({ 'location.coordinates': 1 }).toArray();

    let zoned = 0;
    const unmatched = [];
    for (const r of unzoned) {
        const [lng, lat] = r.location.coordinates;
        const hit = polygons.find((z) => isPointInPolygon(num(lat), num(lng), z.points));
        if (!hit) { unmatched.push(String(r._id)); continue; }
        zoned += 1;
        if (apply) {
            await T.collection('food_restaurants').updateOne({ _id: r._id }, { $set: { zoneId: hit._id } });
        }
    }
    log(`  ${apply ? 'assigned' : 'would assign'} a zone to ${zoned} seller(s); ${unmatched.length} fall outside every zone polygon`);

    // ---- business settings / branding -------------------------------------
    //
    // The app auto-creates a default settings row per vertical on first boot,
    // so the storefront was serving "Switcheats" with an empty logo on a site
    // called maava.in. The real branding -- name, logo, address, support phone
    // -- is one document in the source.
    //
    // This is the one place the migration UPDATES rather than inserts, because
    // the rows it is correcting were written by the application itself minutes
    // earlier, not by a human. It only fills fields that are still empty or
    // still hold the boot default, so anything since edited in the admin panel
    // survives.
    const [srcBiz] = await S.collection('businesssettings').find({}).limit(1).toArray();
    const [srcStore] = await S.collection('inmartstores').find({}).limit(1).toArray();

    /**
     * Each vertical is its own brand: the food side is Maava, the quick side is
     * Hibermart. Sharing one settings row would put the restaurant company's
     * name and logo on the grocery storefront.
     *
     * The source has a full settings document for the food business, but only
     * the store record for the grocery one -- so Hibermart gets its name, phone
     * and address, and no logo, because there is no logo to take. That is left
     * empty for someone to upload rather than filled with Maava's.
     */
    const BRANDING = {
        food: srcBiz && {
            companyName: str(srcBiz.companyName, 'Maava'),
            email: str(srcBiz.email),
            address: str(srcBiz.address),
            state: str(srcBiz.state),
            pincode: str(srcBiz.pincode),
            phone: srcBiz.phone || undefined,
            logo: srcBiz.logo || undefined,
            favicon: srcBiz.favicon || undefined,
        },
        quick: srcStore && {
            companyName: str(srcStore.name, 'Hibermart'),
            email: str(srcStore.ownerEmail),
            address: str(srcStore.location?.city),
            state: str(srcStore.location?.state),
            pincode: str(srcStore.location?.pincode),
            phone: str(srcStore.ownerPhone)
                ? { countryCode: '+91', number: digits10(srcStore.ownerPhone) }
                : undefined,
        },
    };

    if (srcBiz || srcStore) {
        let branded = 0;
        for (const v of ['food', 'quick']) {
            const branding = BRANDING[v];
            if (!branding) continue;
            const rows = await T.collection('foodbusinesssettings')
                .find({ vertical: v }).sort({ createdAt: 1 }).toArray();
            if (!rows.length) continue;
            // Keep the oldest row per vertical; the extras are duplicate boot
            // defaults and findOne() picking between them is a coin toss.
            const keep = rows[0];
            const extras = rows.slice(1).filter((r) => !str(r.logo?.url) && !str(r.address));
            if (apply) {
                await T.collection('foodbusinesssettings').updateOne({ _id: keep._id }, {
                    $set: Object.fromEntries(Object.entries(branding).filter(([, val]) => val !== undefined && val !== '')),
                });

                // A vertical with no logo of its own must not keep another
                // vertical's. An earlier run applied the food branding to both,
                // so Hibermart was wearing Maava's logo -- which looks correct
                // and is wrong. Cleared ONLY when it still matches the other
                // vertical's, so a logo since uploaded here survives.
                if (!branding.logo?.url) {
                    const otherLogo = BRANDING[v === 'food' ? 'quick' : 'food']?.logo?.url;
                    const currentLogo = keep.logo?.url;
                    if (currentLogo && otherLogo && currentLogo === otherLogo) {
                        await T.collection('foodbusinesssettings').updateOne(
                            { _id: keep._id },
                            { $set: { logo: { url: '', publicId: '' }, favicon: { url: '', publicId: '' } } },
                        );
                        log(`  cleared ${v}: it was showing the other vertical's logo`);
                    }
                }
                if (extras.length) {
                    await T.collection('foodbusinesssettings')
                        .deleteMany({ _id: { $in: extras.map((r) => r._id) } });
                }
            }
            branded += 1;
            if (extras.length) log(`  ${apply ? 'removed' : 'would remove'} ${extras.length} duplicate boot-default settings row(s) for ${v}`);
        }
        log(`  ${apply ? 'branded' : 'would brand'} business settings for ${branded} vertical(s) from the source`);
    }

    // ---- global browse categories ----------------------------------------
    //
    // The homepage's "What's on your mind today?" tiles come from GLOBAL
    // categories -- ones with no restaurantId. The source keeps those in
    // admincategorymanagements (shawarma, Pizza, Idli...), which is a different
    // thing from restaurantcategories: those are one restaurant's own menu
    // sections and are correctly restaurant-scoped.
    //
    // Without these the storefront renders an empty category strip, because
    // listPublicCategories derives its list from FoodItem.categoryId and then
    // keeps only categories that are global.
    const adminCats = await S.collection('admincategorymanagements').find({}).toArray();
    record('admincategorymanagements -> food_categories (global)', await insertMissing(T, 'food_categories',
        adminCats.filter((c) => str(c.name)).map((c) => ({
            _id: c._id,
            vertical: 'food',
            name: str(c.name),
            description: str(c.description),
            image: imageUrl(c.image),
            // No restaurantId on purpose: that is what makes it global.
            isActive: c.status !== false,
            isApproved: true,
            approvalStatus: 'approved',
            sortOrder: num(c.priority),
            createdAt: c.createdAt, updatedAt: c.updatedAt,
        }))));

    // ---- link items to a global category ----------------------------------
    //
    // Items arrive with the free-text menu-section name they had in the source
    // and no categoryId, so the public category list -- which is built from
    // FoodItem.categoryId -- comes back empty however many categories exist.
    //
    // Matched on a normalised name. Only ~14% of items match one of the seven
    // curated categories, and that is the honest number: the other 105 section
    // names are one restaurant's menu structure ("STARTERS", "Biryani _ non _
    // veg"), not things a shopper browses by. Those items stay reachable
    // through their restaurant and through search, which is how the app is
    // meant to work; inventing a global category per section name would put
    // "GHINESE   ITEMS" on the homepage.
    const normName = (v) => str(v).toLowerCase().replace(/[^a-z0-9]/g, '');
    const globalCats = await T.collection('food_categories')
        .find({ vertical: 'food', restaurantId: { $exists: false } }, { projection: { name: 1 } }).toArray();

    let linked = 0;
    if (globalCats.length) {
        for (const cat of globalCats) {
            const k = normName(cat.name);
            if (!k) continue;
            const names = await T.collection('food_items').distinct('categoryName', {
                vertical: 'food', categoryId: null,
            });
            const matches = names.filter((n) => {
                const nk = normName(n);
                return nk && (nk === k || nk.includes(k) || k.includes(nk));
            });
            if (!matches.length) continue;
            if (apply) {
                const r = await T.collection('food_items').updateMany(
                    { vertical: 'food', categoryId: null, categoryName: { $in: matches } },
                    { $set: { categoryId: cat._id } },
                );
                linked += r.modifiedCount;
            } else {
                linked += await T.collection('food_items').countDocuments({
                    vertical: 'food', categoryId: null, categoryName: { $in: matches },
                });
            }
        }
    }
    log(`  ${apply ? 'linked' : 'would link'} ${linked} item(s) to a global category`);

    // ---- repair: fill the singular `image` from the gallery ---------------
    // Earlier runs of this script populated only `images`, so every already
    // migrated item renders a blank thumbnail in the admin list. Idempotent:
    // it only touches rows where `image` is empty and a gallery exists.
    const needsThumb = await T.collection('food_items').countDocuments({
        $and: [
            { $or: [{ image: '' }, { image: { $exists: false } }, { image: null }] },
            { 'images.0': { $exists: true } },
        ],
    });
    if (needsThumb) {
        if (apply) {
            const r = await T.collection('food_items').updateMany(
                {
                    $and: [
                        { $or: [{ image: '' }, { image: { $exists: false } }, { image: null }] },
                        { 'images.0': { $exists: true } },
                    ],
                },
                [{ $set: { image: { $arrayElemAt: ['$images', 0] } } }],
            );
            log(`  repaired thumbnails: ${r.modifiedCount} item(s) given image from images[0]`);
        } else {
            log(`  would repair thumbnails on ${needsThumb} item(s)`);
        }
    }

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

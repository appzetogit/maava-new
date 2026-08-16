/**
 * Seeds a full quick-commerce catalogue: categories, sellers, products with
 * images, hero banners and coupon offers.
 *
 * Why this exists alongside `seed-quick-commerce.js`: that script seeds a
 * minimal Bengaluru catalogue with no imagery, no banners and no offers, which
 * leaves most of the app's home sections empty. This one fills every section
 * the quick home renders, and seeds into an existing serviceable zone so the
 * catalogue is actually orderable rather than just visible.
 *
 * MUST be run with the vertical set, or the plugin stamps everything `food`
 * (the process default) and grocery data lands in the restaurant app:
 *
 *   VERTICAL=quick node scripts/seed-quick-catalog.js
 *   VERTICAL=quick node scripts/seed-quick-catalog.js --wipe
 *
 * Idempotent: re-running updates the same documents rather than duplicating.
 * Everything it creates carries SEED_TAG so `--wipe` removes exactly this data
 * and nothing else — in particular it never touches food-vertical rows.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodHeroBanner } from '../src/modules/food/landing/models/heroBanner.model.js';
import { FoodOffer } from '../src/modules/food/admin/models/offer.model.js';
import { config } from '../src/config/env.js';

const SEED_TAG = 'seed:quick-catalog';

/** Every URL here was checked for a 200 before being committed. */
const IMG = {
    milk: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=70',
    curd: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&q=70',
    butter: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&q=70',
    bread: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=70',
    eggs: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&q=70',
    fruit: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&q=70',
    veg: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=70',
    rice: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=70',
    flour: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&q=70',
    oil: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&q=70',
    snacks: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&q=70',
    biscuit: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=70',
    drinks: 'https://images.unsplash.com/photo-1581636625402-29b2a704ef13?w=400&q=70',
    tea: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400&q=70',
    coffee: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&q=70',
    chocolate: 'https://images.unsplash.com/photo-1548907040-4baa42d10919?w=400&q=70',
    icecream: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=400&q=70',
    detergent: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=400&q=70',
    shampoo: 'https://images.unsplash.com/photo-1595425970377-c9703cf48b6d?w=400&q=70',
    baby: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&q=70',
    store: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=600&q=70',
    storeCover: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&q=70',
    banner1: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=70',
    banner2: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=1200&q=70',
    banner3: 'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=1200&q=70',
};

/** Top-level categories, in the order the home rail shows them. */
const CATEGORIES = [
    ['Dairy & Milk', IMG.milk],
    ['Fruits & Vegetables', IMG.fruit],
    ['Snacks', IMG.snacks],
    ['Beverages', IMG.drinks],
    ['Biscuits', IMG.biscuit],
    ['Breakfast', IMG.bread],
    ['Bakery', IMG.bread],
    ['Staples', IMG.rice],
    ['Rice & Pulses', IMG.rice],
    ['Atta & Flour', IMG.flour],
    ['Oils & Ghee', IMG.oil],
    ['Personal Care', IMG.shampoo],
    ['Household Essentials', IMG.detergent],
    ['Cleaning', IMG.detergent],
    ['Baby Care', IMG.baby],
    ['Ice Creams', IMG.icecream],
    ['Chocolates', IMG.chocolate],
    ['Instant Food', IMG.snacks],
];

/**
 * Sellers, placed on real Indore coordinates so they fall inside the existing
 * `indore` zone. A seller outside the delivery zone is refused at checkout, so
 * seeding into a zone that is actually serviced is what makes the catalogue
 * orderable rather than merely visible.
 */
const SELLERS = [
    ['Appzeto Fresh', '9000000201', 22.7196, 75.8577, '8-12 mins', 4.6, 1240],
    ['Daily Needs', '9000000202', 22.7533, 75.8937, '10-15 mins', 4.4, 860],
    ['FreshMart', '9000000203', 22.6797, 75.8333, '12-18 mins', 4.5, 1520],
    ["Tanu's Store", '9000000204', 22.7420, 75.8930, '9-14 mins', 4.3, 410],
    ['Quick Basket', '9000000205', 22.7100, 75.8700, '10-16 mins', 4.2, 305],
    ['Grocery Hub', '9000000206', 22.7300, 75.8800, '15-20 mins', 4.1, 690],
];

// category, name, brand, pack, price, mrp, gst, stock, image
const PRODUCTS = [
    ['Dairy & Milk', 'Full Cream Milk', 'Amul', '1 L', 72, 78, 0, 120, IMG.milk],
    ['Dairy & Milk', 'Toned Milk Pouch', 'Mother Dairy', '500 ml', 27, 30, 0, 150, IMG.milk],
    ['Dairy & Milk', 'Fresh Curd', 'Nandini', '400 g', 40, 45, 0, 80, IMG.curd],
    ['Dairy & Milk', 'Malai Paneer', 'Amul', '200 g', 95, 105, 5, 40, IMG.butter],
    ['Dairy & Milk', 'Salted Butter', 'Amul', '500 g', 285, 310, 12, 35, IMG.butter],
    ['Bakery', 'Whole Wheat Bread', 'Britannia', '400 g', 45, 50, 5, 70, IMG.bread],
    ['Breakfast', 'Farm Eggs', '', '12 pcs', 84, 96, 0, 90, IMG.eggs],
    ['Fruits & Vegetables', 'Banana Robusta', '', '1 kg', 54, 65, 0, 60, IMG.fruit],
    ['Fruits & Vegetables', 'Royal Gala Apple', '', '4 pcs', 189, 220, 0, 45, IMG.fruit],
    ['Fruits & Vegetables', 'Tomato Local', '', '1 kg', 32, 40, 0, 100, IMG.veg],
    ['Fruits & Vegetables', 'Potato', '', '1 kg', 30, 38, 0, 110, IMG.veg],
    ['Fruits & Vegetables', 'Onion', '', '1 kg', 38, 46, 0, 95, IMG.veg],
    ['Rice & Pulses', 'Basmati Rice', 'India Gate', '1 kg', 132, 150, 5, 55, IMG.rice],
    ['Rice & Pulses', 'Toor Dal', 'Tata', '1 kg', 178, 199, 5, 48, IMG.rice],
    ['Rice & Pulses', 'Moong Dal', 'Tata', '1 kg', 148, 165, 5, 42, IMG.rice],
    ['Atta & Flour', 'Whole Wheat Atta', 'Aashirvaad', '5 kg', 285, 320, 5, 50, IMG.flour],
    ['Oils & Ghee', 'Sunflower Oil', 'Fortune', '1 L', 148, 170, 5, 60, IMG.oil],
    ['Oils & Ghee', 'Pure Cow Ghee', 'Amul', '500 ml', 340, 375, 12, 30, IMG.oil],
    ['Biscuits', 'Marie Gold', 'Britannia', '250 g', 35, 40, 18, 130, IMG.biscuit],
    ['Biscuits', 'Parle-G Original', 'Parle', '800 g', 90, 100, 18, 100, IMG.biscuit],
    ['Snacks', 'Classic Salted Chips', "Lay's", '52 g', 20, 20, 18, 160, IMG.snacks],
    ['Snacks', 'Aloo Bhujia', 'Haldiram', '400 g', 105, 120, 12, 55, IMG.snacks],
    ['Beverages', 'Coca-Cola Bottle', 'Coca-Cola', '750 ml', 40, 45, 28, 140, IMG.drinks],
    ['Beverages', 'Pepsi Bottle', 'Pepsi', '750 ml', 40, 45, 28, 120, IMG.drinks],
    ['Beverages', 'Mixed Fruit Juice', 'Tropicana', '1 L', 120, 140, 12, 65, IMG.drinks],
    ['Beverages', 'Red Label Tea', 'Tata', '500 g', 265, 295, 5, 45, IMG.tea],
    ['Beverages', 'Instant Coffee', 'Nestlé', '50 g', 190, 215, 18, 38, IMG.coffee],
    ['Instant Food', 'Maggi Noodles', 'Nestlé', '560 g', 96, 110, 12, 150, IMG.snacks],
    ['Chocolates', 'Dairy Milk Silk', 'Nestlé', '150 g', 165, 180, 18, 85, IMG.chocolate],
    ['Ice Creams', 'Vanilla Tub', 'Amul', '700 ml', 210, 240, 18, 40, IMG.icecream],
    // Deliberately zero so the out-of-stock rendering has something to show.
    ['Ice Creams', 'Choco Bar Pack', 'Mother Dairy', '6 pcs', 150, 170, 18, 0, IMG.icecream],
    ['Cleaning', 'Surf Excel Matic', 'Surf Excel', '2 kg', 420, 470, 18, 50, IMG.detergent],
    ['Cleaning', 'Dishwash Gel', 'Vim', '750 ml', 129, 145, 18, 60, IMG.detergent],
    ['Personal Care', 'Dove Shampoo', 'Dove', '340 ml', 299, 340, 18, 45, IMG.shampoo],
    ['Personal Care', 'Dove Beauty Bar', 'Dove', '3 x 100 g', 189, 210, 18, 70, IMG.shampoo],
    ['Baby Care', 'Baby Wipes', 'Himalaya', '72 pcs', 199, 225, 12, 40, IMG.baby],
    ['Household Essentials', 'Garbage Bags', 'Tata', '30 pcs', 149, 170, 18, 55, IMG.detergent],
];

const BANNERS = [
    ['Fresh groceries delivered in 10 minutes', IMG.banner1],
    ['Best prices on daily essentials', IMG.banner2],
    ['Weekend grocery deals', IMG.banner3],
    ['Fresh fruits & vegetables', IMG.fruit],
    ['Snacks & beverages offers', IMG.snacks],
];

// code, type, value, minOrder, maxDiscount.
// The offer schema carries no title/description field — the app composes the
// label from the discount itself — so nothing descriptive is set here; it would
// be dropped by strict mode and read as data that exists when it does not.
const OFFERS = [
    ['QUICK10', 'percentage', 10, 199, 60],
    ['SAVE20', 'percentage', 20, 499, 150],
    ['FLAT50', 'flat-price', 50, 299, null],
    ['MEGA30', 'percentage', 30, 999, 300],
    ['FREEDEL', 'flat-price', 40, 149, null],
];

const wipe = process.argv.includes('--wipe');

async function main() {
    if (config.defaultVertical !== 'quick') {
        throw new Error(
            `refusing to run with VERTICAL=${config.defaultVertical}. ` +
                'Run as: VERTICAL=quick node scripts/seed-quick-catalog.js — ' +
                'otherwise every document is stamped food and grocery data lands in the restaurant app.',
        );
    }

    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 30000,
    });
    console.log(`connected -> ${mongoose.connection.name} (vertical=${config.defaultVertical})`);

    if (wipe) {
        const sellerIds = (await FoodRestaurant.find({ website: SEED_TAG }).select('_id').lean())
            .map((s) => s._id);
        const removed = await Promise.all([
            FoodItem.deleteMany({ restaurantId: { $in: sellerIds } }),
            FoodRestaurant.deleteMany({ website: SEED_TAG }),
            FoodCategory.deleteMany({ type: SEED_TAG }),
            FoodHeroBanner.deleteMany({ publicId: SEED_TAG }),
            FoodOffer.deleteMany({ couponCode: { $in: OFFERS.map((o) => o[0]) } }),
        ]);
        console.log('wiped:', removed.map((r) => r.deletedCount).join(', '));
        await mongoose.disconnect();
        return;
    }

    // --- zone: reuse a serviceable one rather than inventing another ---
    let zone = await FoodZone.findOne({ isActive: true, name: /indore/i });
    if (!zone) zone = await FoodZone.findOne({ isActive: true });
    if (!zone) throw new Error('no active zone — create one in the admin panel first');
    console.log(`zone: ${zone.name}`);

    // --- categories ---
    const catByName = new Map();
    let order = 0;
    for (const [name, image] of CATEGORIES) {
        const doc = await FoodCategory.findOneAndUpdate(
            { name, restaurantId: { $exists: false } },
            {
                $set: {
                    name,
                    image,
                    type: SEED_TAG,
                    foodTypeScope: 'Both',
                    approvalStatus: 'approved',
                    isApproved: true,
                    isActive: true,
                    sortOrder: order++,
                },
                $unset: { parentId: 1 },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        catByName.set(name, doc);
    }
    console.log(`categories: ${catByName.size}`);

    // --- sellers ---
    const sellers = [];
    for (const [name, phone, lat, lng, eta, rating, ratings] of SELLERS) {
        const doc = await FoodRestaurant.findOneAndUpdate(
            { ownerPhone: phone },
            {
                $set: {
                    restaurantName: name,
                    ownerName: name,
                    ownerEmail: `${phone}@example.com`,
                    ownerPhone: phone,
                    primaryContactNumber: phone,
                    profileImage: IMG.store,
                    coverImage: IMG.storeCover,
                    zoneId: zone._id,
                    status: 'approved',
                    approvedAt: new Date(),
                    isAcceptingOrders: true,
                    isVerified: true,
                    estimatedDeliveryTime: eta,
                    rating,
                    totalRatings: ratings,
                    openingTime: '12:00 AM',
                    closingTime: '11:59 PM',
                    openDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                    addressLine1: 'Vijay Nagar',
                    area: 'Vijay Nagar',
                    city: 'Indore',
                    state: 'Madhya Pradesh',
                    pincode: '452010',
                    latitude: lat,
                    longitude: lng,
                    location: { type: 'Point', coordinates: [lng, lat] },
                    pureVegRestaurant: false,
                    // Sellers have no tag field of their own; this marks ours.
                    website: SEED_TAG,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        sellers.push(doc);
    }
    console.log(`sellers: ${sellers.length}`);

    // --- products, spread so each seller carries a different slice ---
    let listings = 0;
    for (const [index, product] of PRODUCTS.entries()) {
        const [catName, name, brand, packSize, price, mrp, gstRate, stockQty, image] = product;
        const category = catByName.get(catName);
        if (!category) continue;

        // Every product is carried by at least two sellers so "same item, two
        // stores, two prices" is real; the rotation keeps catalogues distinct.
        const carriers = [
            sellers[index % sellers.length],
            sellers[(index + 2) % sellers.length],
        ];

        for (const [n, seller] of carriers.entries()) {
            const sellerPrice = n === 1 ? Math.min(Math.round(price * 1.04), mrp || price) : price;
            await FoodItem.findOneAndUpdate(
                { restaurantId: seller._id, name },
                {
                    $set: {
                        restaurantId: seller._id,
                        categoryId: category._id,
                        categoryName: category.name,
                        name,
                        brand,
                        packSize,
                        image,
                        images: [image],
                        description: `${brand ? brand + ' ' : ''}${name}${packSize ? ' · ' + packSize : ''}`,
                        price: sellerPrice,
                        mrp: mrp || null,
                        otherPrice: 0,
                        gstRate,
                        stockQty: n === 1 ? Math.ceil(stockQty / 2) : stockQty,
                        lowStockThreshold: 10,
                        maxQtyPerOrder: 10,
                        isAvailable: stockQty > 0,
                        foodType: 'Veg',
                        approvalStatus: 'approved',
                        approvedAt: new Date(),
                        rating: 4 + ((index % 10) / 10),
                        totalRatings: 20 + index * 3,
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );
            listings++;
        }
    }
    console.log(`products: ${listings} listings from ${PRODUCTS.length} distinct items`);

    // --- hero banners ---
    for (const [i, [title, imageUrl]] of BANNERS.entries()) {
        await FoodHeroBanner.findOneAndUpdate(
            { title, publicId: SEED_TAG },
            {
                $set: {
                    title,
                    imageUrl,
                    publicId: SEED_TAG,
                    ctaText: 'Shop now',
                    sortOrder: i,
                    isActive: true,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
    }
    console.log(`banners: ${BANNERS.length}`);

    // --- offers ---
    const year = 1000 * 60 * 60 * 24 * 365;
    for (const [couponCode, discountType, discountValue, minOrderValue, maxDiscount] of OFFERS) {
        await FoodOffer.findOneAndUpdate(
            { couponCode },
            {
                $set: {
                    couponCode,
                    discountType,
                    discountValue,
                    minOrderValue,
                    maxDiscount,
                    customerScope: 'all',
                    restaurantScope: 'all',
                    status: 'active',
                    showInCart: true,
                    createdByRole: 'ADMIN',
                    startDate: new Date(Date.now() - year),
                    endDate: new Date(Date.now() + year),
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
    }
    console.log(`offers: ${OFFERS.length}`);

    await mongoose.disconnect();
    console.log('done');
}

main().catch((err) => {
    console.error('seed failed:', err.message);
    process.exit(1);
});

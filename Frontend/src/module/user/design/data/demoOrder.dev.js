/**
 * Local development only: a sample order for checking the tracking page's
 * layout without signing in (/food/user/dev/order/demo). Imported behind
 * import.meta.env.DEV, so production builds never include it.
 */
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString()

export const demoOrder = {
  _id: "demo000000000000000000000",
  orderMongoId: "demo000000000000000000000",
  orderId: "FOD-DEMO-1042",
  orderStatus: "picked_up",
  status: "picked_up",
  createdAt: minutesAgo(26),
  restaurantId: {
    _id: "69fc48afbfb3d1eea69f0a54",
    restaurantName: "Dosa palace",
    location: { type: "Point", coordinates: [78.138293, 16.7716777], latitude: 16.7716777, longitude: 78.138293 },
  },
  deliveryAddress: {
    label: "Home",
    street: "Station Road",
    additionalDetails: "Flat 3B, Sai Residency",
    city: "Jadcherla",
    state: "Telangana",
    zipCode: "509301",
    location: { type: "Point", coordinates: [78.1512, 16.7818] },
  },
  customerName: "Sample Customer",
  customerPhone: "9000000000",
  dispatch: {
    status: "accepted",
    deliveryPartnerId: { _id: "rider-demo", name: "Ravi Kumar", phone: "9000000001", rating: 4.8, totalRatings: 212, vehicleType: "Bike", vehicleNumber: "TS 08 AB 1234" },
  },
  deliveryState: { currentPhase: "en_route_to_delivery", currentLocation: { lat: 16.7765, lng: 78.1445 } },
  deliveryVerification: { dropOtp: { required: true, verified: false } },
  handoverOtp: "4821",
  eta: { minutes: 9, distanceKm: 1.6, source: "live", target: "customer" },
  statusHistory: [
    { to: "confirmed", at: minutesAgo(25) },
    { to: "preparing", at: minutesAgo(24) },
    { to: "ready_for_pickup", at: minutesAgo(12) },
    { to: "reached_pickup", at: minutesAgo(10) },
    { to: "picked_up", at: minutesAgo(7) },
  ],
  items: [
    { itemId: "ed2eafd2a37e34e13caee78a", name: "Butter Dosa", price: 86, quantity: 2, isVeg: true },
    { itemId: "45f3eeed33beccbb2fcb2a5e", name: "Masala dosa", price: 54, quantity: 1, isVeg: true },
  ],
  pricing: { subtotal: 226, deliveryFee: 20, platformFee: 0, tax: 0, total: 246 },
  payment: { method: "razorpay", status: "paid" },
}

const variant = (n, patch) => ({ ...demoOrder, _id: `demo${n}`, orderMongoId: `demo${n}`, orderId: `FOD-DEMO-10${n}`, ...patch })

/** Sample orders list: one active, one delivered and unrated, one rated, one cancelled. */
export const demoOrders = [
  demoOrder,
  variant(31, { orderStatus: "delivered", status: "delivered", createdAt: minutesAgo(60 * 26), deliveredAt: minutesAgo(60 * 25), handoverOtp: undefined }),
  variant(29, {
    orderStatus: "delivered",
    status: "delivered",
    createdAt: minutesAgo(60 * 24 * 6),
    deliveredAt: minutesAgo(60 * 24 * 6 - 35),
    ratings: { restaurant: { rating: 4 } },
    restaurantId: { _id: "r2", restaurantName: "Ramesh Tiffin Center" },
    items: [{ itemId: "x1", name: "Idli Vada", price: 60, quantity: 3, isVeg: true }],
    pricing: { total: 200 },
    payment: { method: "cash", status: "paid" },
  }),
  variant(27, {
    orderStatus: "cancelled_by_restaurant",
    status: "cancelled_by_restaurant",
    createdAt: minutesAgo(60 * 24 * 12),
    cancellationReason: "Not accepted by restaurant",
    restaurantId: { _id: "r3", restaurantName: "Hotel Tara Military Mess" },
    items: [{ itemId: "x2", name: "Chicken Biryani", price: 240, quantity: 1, isVeg: false }],
    pricing: { total: 265 },
  }),
]

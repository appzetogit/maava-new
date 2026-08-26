/**
 * Fire a REAL new-order push at a seller, through the backend's own code path.
 *
 * Runs `notifyRestaurantNewOrder` — the exact function order creation calls — so
 * the device receives the genuine payload (same data keys, same channel, same
 * tray tag) rather than a hand-rolled imitation.
 *
 * `notifyRestaurantNewOrder` only sends if it can atomically claim
 * `restaurantNotifiedAt` from null, so this clears that field first and puts the
 * original timestamp back afterwards. Nothing else about the order is touched.
 *
 * Usage: node fireorder.mjs <vertical> <orderId>
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { runWithVertical } from './src/core/vertical/verticalScope.js';
import { notifyRestaurantNewOrder } from './src/modules/food/orders/services/order.helpers.js';
import { FoodOrder } from './src/modules/food/orders/models/order.model.js';

const [vertical, orderId] = process.argv.slice(2);
if (!vertical || !orderId) {
  console.error('usage: node fireorder.mjs <food|quick> <orderId>');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

await runWithVertical(vertical, async () => {
  const before = await FoodOrder.findById(orderId).select('restaurantNotifiedAt order_id restaurantId').lean();
  if (!before) {
    console.error('order not found in vertical', vertical);
    return;
  }
  const original = before.restaurantNotifiedAt ?? null;
  console.log('order %s (%s) seller=%s', orderId, before.order_id, before.restaurantId);

  await FoodOrder.updateOne({ _id: orderId }, { $set: { restaurantNotifiedAt: null } });

  const doc = await FoodOrder.findById(orderId);
  await notifyRestaurantNewOrder(doc);

  // Put the claim back exactly as it was, so this leaves no trace.
  await FoodOrder.updateOne({ _id: orderId }, { $set: { restaurantNotifiedAt: original } });
  console.log('sent; restaurantNotifiedAt restored to', original);
});

await mongoose.disconnect();

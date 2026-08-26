/**
 * Why does the Mart outlet report "currently closed"?
 *
 * Loads both quick outlets exactly as order creation does (same loader, same
 * timing attachment) and prints the availability verdict. Read-only.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { runWithVertical } from './src/core/vertical/verticalScope.js';
import { loadRestaurantForOrdering } from './src/modules/food/orders/services/order-pricing.service.js';
import { getRestaurantAvailabilityStatus } from './src/modules/food/restaurant/helpers/restaurantAvailability.helper.js';

await mongoose.connect(process.env.MONGODB_URI);

const OUTLETS = {
  'rani bagh': '6a8611c0297be6be427f9094',
  'Palasia': '6a81b8d8cc7e3947d2ad6e32',
};

const now = new Date();
console.log('server time:', now.toString());

for (const [label, id] of Object.entries(OUTLETS)) {
  await runWithVertical('quick', async () => {
    const r = await loadRestaurantForOrdering(id);
    const status = getRestaurantAvailabilityStatus(r, now);
    console.log(`\n${label}:`);
    console.log('  openingTime=%j closingTime=%j', r.openingTime, r.closingTime);
    console.log('  isAcceptingOrders=%j outsideHoursOverride=%j', r.isAcceptingOrders, r.outsideHoursOverride);
    console.log('  verdict:', JSON.stringify(status));
  });
}

await mongoose.disconnect();

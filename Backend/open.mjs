/** Which stores can accept an order right now? Read-only. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { runWithVertical } from './src/core/vertical/verticalScope.js';
import { loadRestaurantForOrdering } from './src/modules/food/orders/services/order-pricing.service.js';
import { getRestaurantAvailabilityStatus } from './src/modules/food/restaurant/helpers/restaurantAvailability.helper.js';
import { FoodRestaurant } from './src/modules/food/restaurant/models/restaurant.model.js';

await mongoose.connect(process.env.MONGODB_URI);
const now = new Date();
console.log('server time:', now.toString());
for (const v of ['food', 'quick']) {
  await runWithVertical(v, async () => {
    const rows = await FoodRestaurant.find({ status: 'approved' }).select('restaurantName').limit(40).lean();
    let open = 0;
    const openNames = [];
    for (const r of rows) {
      try {
        const full = await loadRestaurantForOrdering(String(r._id));
        if (getRestaurantAvailabilityStatus(full, now).isOpen) { open++; openNames.push(r.restaurantName); }
      } catch (_) {}
    }
    console.log(`${v}: ${open}/${rows.length} open -> ${openNames.slice(0,6).join(' | ')}`);
  });
}
await mongoose.disconnect();

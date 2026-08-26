import 'dotenv/config';
import mongoose from 'mongoose';
import { runWithVertical } from './src/core/vertical/verticalScope.js';
import { loadRestaurantForOrdering } from './src/modules/food/orders/services/order-pricing.service.js';
import { getRestaurantAvailabilityStatus } from './src/modules/food/restaurant/helpers/restaurantAvailability.helper.js';
await mongoose.connect(process.env.MONGODB_URI);
await runWithVertical('food', async () => {
  const r = await loadRestaurantForOrdering('6a8c1c8ddca4517139090d99');
  console.log('name:', r.restaurantName);
  console.log('verdict:', JSON.stringify(getRestaurantAvailabilityStatus(r, new Date())));
  console.log('location:', JSON.stringify(r.location?.coordinates));
});
await mongoose.disconnect();

/** Place a genuine order through the real creation path (pricing, stock,
 *  acceptance window, seller push — all of it), as the real customer. */
import 'dotenv/config';
import mongoose from 'mongoose';
import * as orderService from './src/modules/food/orders/services/order.service.js';
import { validateCreateOrderDto } from './src/modules/food/orders/validators/order.validator.js';
import { runWithVertical } from './src/core/vertical/verticalScope.js';

const USER = '6a81b86fad699dbd0b361554';

await mongoose.connect(process.env.MONGODB_URI);
await runWithVertical('food', async () => {
  const dto = validateCreateOrderDto({
    restaurantId: '6a8c1c8ddca4517139090d99',
    restaurantName: 'Tanu Chouhan',
    customerName: 'tAnu',
    customerPhone: '9301988718',
    paymentMethod: 'cash',
    items: [
      { itemId: '6a8c1dbadca451713909101a', name: 'paneer', price: 400, quantity: 2, isVeg: true },
    ],
    address: {
      label: 'Home', name: 'tAnu', fullName: 'tAnu',
      street: '56', additionalDetails: 'Rani Bagh Main',
      city: 'Indore', state: 'Madhya Pradesh', zipCode: '452001',
      latitude: 22.671944, longitude: 75.8755929,
      location: { type: 'Point', coordinates: [75.8755929, 22.671944] },
    },
    pricing: { subtotal: 800, total: 800 },
  });

  const order = await orderService.createOrder(USER, dto);
  const o = order?.order ?? order;
  console.log('PLACED', o?.order_id, o?._id?.toString?.());
  console.log('status', o?.orderStatus, '| deadline', o?.acceptanceDeadlineAt);
  console.log('pricing', JSON.stringify(o?.pricing));
});
await mongoose.disconnect();

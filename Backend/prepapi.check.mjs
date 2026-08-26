/** The accept path records the kitchen's chosen prep time. Run: node prepapi.check.mjs */
import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { validateOrderStatusDto } from './src/modules/food/orders/validators/order.validator.js';
import * as orderService from './src/modules/food/orders/services/order.service.js';
import { runWithVertical } from './src/core/vertical/verticalScope.js';

const ORDER = '6a8c2b06bd8fcad23a4681c5';
const SELLER = '6a8c1c8ddca4517139090d99';

// --- validator ---------------------------------------------------------------
assert.equal(validateOrderStatusDto({ orderStatus: 'confirmed' }).packingMinutes, undefined,
  'omitted stays omitted, so existing callers are unaffected');
assert.equal(validateOrderStatusDto({ orderStatus: 'confirmed', packingMinutes: 22 }).packingMinutes, 22);
assert.equal(validateOrderStatusDto({ orderStatus: 'confirmed', packingMinutes: '22' }).packingMinutes, 22,
  'coerced from the string a JSON client may send');
for (const bad of [0, -1, 181, 9999]) {
  assert.throws(() => validateOrderStatusDto({ orderStatus: 'confirmed', packingMinutes: bad }),
    `must reject ${bad}`);
}

await mongoose.connect(process.env.MONGODB_URI);
const col = mongoose.connection.db.collection('food_orders');
const reset = async () => col.updateOne({ _id: new mongoose.Types.ObjectId(ORDER) }, {
  $set: { orderStatus: 'created', acceptanceDeadlineAt: new Date(Date.now() + 100_000) },
  $unset: { 'pricing.packingMinutes': '' },
});
const read = async () => (await col.findOne({ _id: new mongoose.Types.ObjectId(ORDER) },
  { projection: { orderStatus: 1, 'pricing.packingMinutes': 1 } }));

await runWithVertical('food', async () => {
  // --- chosen value is recorded on acceptance -------------------------------
  await reset();
  await orderService.updateOrderStatusRestaurant(ORDER, SELLER, 'confirmed', '', 22);
  let doc = await read();
  assert.equal(doc.orderStatus, 'confirmed');
  assert.equal(doc.pricing.packingMinutes, 22, 'the kitchen’s choice must be recorded');

  // --- omitted leaves whatever was quoted -----------------------------------
  await reset();
  await orderService.updateOrderStatusRestaurant(ORDER, SELLER, 'confirmed', '', undefined);
  doc = await read();
  assert.ok(doc.pricing.packingMinutes == null, 'omitted must not invent a value');
});

await reset();
await mongoose.disconnect();
console.log('prep-time accept path OK');

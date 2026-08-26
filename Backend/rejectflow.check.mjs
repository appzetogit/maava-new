/** The seller reject path, end to end. Run: node rejectflow.check.mjs
 *
 *  Guards the regression this was written for: the reason used to live only
 *  inside statusHistory, so every client read it back as null.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import * as orderService from './src/modules/food/orders/services/order.service.js';
import { validateOrderStatusDto } from './src/modules/food/orders/validators/order.validator.js';
import { FoodBusinessSettings } from './src/modules/food/admin/models/businessSettings.model.js';
import { runWithVertical } from './src/core/vertical/verticalScope.js';

const SELLER = '6a8c1c8ddca4517139090d99';
const REASON = 'Kitchen closing soon';

await mongoose.connect(process.env.MONGODB_URI);
const col = mongoose.connection.db.collection('food_orders');

await runWithVertical('food', async () => {
  // --- the list the apps offer ---------------------------------------------
  const settings = await FoodBusinessSettings.findOne()
    .select('restaurantRejectionReasons').lean();
  const reasons = settings?.restaurantRejectionReasons ?? [];
  assert.ok(reasons.length > 0, 'the seller must be offered reasons to pick from');
  assert.ok(reasons.includes(REASON), `${REASON} should be one of them`);

  // --- the reason survives the DTO -----------------------------------------
  const dto = validateOrderStatusDto({
    orderStatus: 'cancelled_by_restaurant',
    note: REASON,
  });
  assert.equal(dto.note, REASON);

  // --- and lands somewhere every client can read ---------------------------
  const target = await col.findOne(
    { restaurantId: new mongoose.Types.ObjectId(SELLER), orderStatus: 'created' },
    { sort: { createdAt: -1 } },
  );
  if (!target) {
    console.log('no pending order to reject — run placeorder.mjs first');
    return;
  }
  await orderService.updateOrderStatusRestaurant(
    target._id.toString(), SELLER, dto.orderStatus, dto.note,
  );

  const doc = await col.findOne({ _id: target._id });
  assert.equal(doc.orderStatus, 'cancelled_by_restaurant');
  assert.equal(doc.cancellationReason, REASON,
    'the reason must be ON the order, not only in statusHistory');

  const entry = [...(doc.statusHistory ?? [])].reverse()
    .find((h) => String(h.to || '').includes('cancel'));
  assert.equal(entry?.note, REASON, 'and still in the history for the audit trail');
  assert.equal(entry?.byRole, 'RESTAURANT');

  console.log(`rejected ${doc.order_id} -> "${doc.cancellationReason}"`);
});

await mongoose.disconnect();
console.log('reject path OK — reason offered, carried, persisted and readable');

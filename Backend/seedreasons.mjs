/** Seed the reason list onto the settings docs that predate the field.
 *  Schema defaults only apply to NEW documents, so existing verticals would
 *  serve an empty list forever. Only fills where the field is absent. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodBusinessSettings } from './src/modules/food/admin/models/businessSettings.model.js';
import { runWithVertical } from './src/core/vertical/verticalScope.js';

const DEFAULTS = [
  'Restaurant is too busy',
  'Item not available',
  'Outside delivery area',
  'Kitchen closing soon',
  'Technical issue',
];
// Mart sells goods, not cooked food — same shape, wording that fits a store.
const MART = [
  'Store is too busy',
  'Item out of stock',
  'Outside delivery area',
  'Store closing soon',
  'Technical issue',
];

await mongoose.connect(process.env.MONGODB_URI);
for (const [vertical, list] of [['food', DEFAULTS], ['quick', MART]]) {
  await runWithVertical(vertical, async () => {
    const r = await FoodBusinessSettings.updateMany(
      { $or: [
        { restaurantRejectionReasons: { $exists: false } },
        { restaurantRejectionReasons: { $size: 0 } },
      ]},
      { $set: { restaurantRejectionReasons: list } },
    );
    const doc = await FoodBusinessSettings.findOne()
      .select('restaurantRejectionReasons').lean();
    console.log(`${vertical}: modified ${r.modifiedCount} ->`,
      (doc?.restaurantRejectionReasons ?? []).join(' | ') || '(none)');
  });
}
await mongoose.disconnect();

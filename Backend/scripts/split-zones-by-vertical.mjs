// Zone split, DRY RUN by default. Pass --apply to write.
//
// Every existing zone is used by both verticals, so it cannot simply be
// stamped: whichever vertical it was not given to would lose its zone. Each
// zone is kept as-is for food (same _id, so food sellers keep working) and
// duplicated for quick, with quick's sellers repointed at the duplicate.
//
// Uses the RAW collection deliberately: the model has no vertical plugin yet,
// and this must run BEFORE the plugin is deployed or the unstamped rows would
// already be invisible.
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';

const APPLY = process.argv.includes('--apply');
await mongoose.connect(config.mongodbUri);
const db = mongoose.connection.db;
const Zones = db.collection('food_zones');
const Sellers = db.collection('food_restaurants');

const zones = await Zones.find({}).toArray();
console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${zones.length} zones\n`);

const plan = [];
for (const z of zones) {
  const foodCount = await Sellers.countDocuments({ zoneId: z._id, vertical: 'food' });
  const quickCount = await Sellers.countDocuments({ zoneId: z._id, vertical: 'quick' });
  plan.push({ z, foodCount, quickCount });
  console.log(`zone "${z.name}"  (${z._id})`);
  console.log(`   food sellers=${foodCount}  quick sellers=${quickCount}  currentVertical=${z.vertical ?? '(none)'}`);
}

console.log('\n--- actions ---');
for (const { z, quickCount } of plan) {
  console.log(`  stamp   ${z.name} -> vertical=food (keeps _id ${z._id})`);
  console.log(`  clone   ${z.name} -> new zone with vertical=quick`);
  if (quickCount) console.log(`  repoint ${quickCount} quick seller(s) onto the clone`);
}

// sellers pointing at a zone that no longer exists
const ids = new Set(zones.map(z => String(z._id)));
const dangling = await Sellers.aggregate([
  { $match: { zoneId: { $ne: null } } },
  { $group: { _id: { z: '$zoneId', v: '$vertical' }, n: { $sum: 1 } } },
]).toArray();
const orphans = dangling.filter(d => !ids.has(String(d._id.z)));
console.log(`\n  dangling zoneId references: ${orphans.length}`);
for (const o of orphans) console.log(`    ${o._id.z} (vertical=${o._id.v}, ${o.n} seller(s)) — left alone, no zone row to split`);

if (APPLY) {
  for (const { z, quickCount } of plan) {
    await Zones.updateOne({ _id: z._id }, { $set: { vertical: 'food' } });
    const clone = { ...z, vertical: 'quick' };
    delete clone._id;
    clone.createdAt = new Date();
    clone.updatedAt = new Date();
    const { insertedId } = await Zones.insertOne(clone);
    if (quickCount) {
      const r = await Sellers.updateMany(
        { zoneId: z._id, vertical: 'quick' },
        { $set: { zoneId: insertedId } },
      );
      console.log(`  repointed ${r.modifiedCount} quick seller(s) from ${z._id} -> ${insertedId}`);
    }
    console.log(`  done: ${z.name} food=${z._id} quick=${insertedId}`);
  }
  const after = await Zones.find({}).project({ name: 1, vertical: 1 }).toArray();
  console.log('\nfinal zones:');
  for (const a of after) console.log(`   ${a.vertical.padEnd(6)} ${a.name}  (${a._id})`);
}
await mongoose.disconnect();

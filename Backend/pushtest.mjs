/**
 * Does a push actually reach the Mart seller device?
 *
 * Sends one test notification to MaavaMart rani bagh — the only quick-vertical
 * seller with a registered device token — using the app's own Firebase service,
 * so this exercises the exact path a real new-order alert takes. Read-only
 * apart from the push itself; it creates no order and touches no session.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { sendNotificationToOwner, listOwnerTokens } from './src/core/notifications/firebase.service.js';
import { runWithVertical } from './src/core/vertical/verticalScope.js';

const OWNER = { ownerType: 'RESTAURANT', ownerId: '6a8611c0297be6be427f9094' };

await mongoose.connect(process.env.MONGODB_URI);

// Same lookup twice: once in the default (food) scope a background job would
// see, once inside the quick scope a /quick request would carry.
for (const v of ['food', 'quick']) {
  const t = await runWithVertical(v, () => listOwnerTokens({ ...OWNER, platform: 'mobile' }));
  console.log(`vertical=${v} -> tokens found: ${t.length}`);
}
const tokens = await runWithVertical('quick', () => listOwnerTokens({ ...OWNER, platform: 'mobile' }));

const result = await runWithVertical('quick', () => sendNotificationToOwner({
  ...OWNER,
  platform: 'mobile',
  payload: {
    title: 'MAAVA test notification',
    body: 'If you can see this, seller push delivery is working.',
    androidChannelId: 'new_order_channel',
    data: { type: 'test' },
  },
}));

console.log('send result:', JSON.stringify(result));
await mongoose.disconnect();

/** Direct push to Tanu Chouhan, to separate delivery from order placement. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { sendNotificationToOwner, listOwnerTokens } from './src/core/notifications/firebase.service.js';
import { runWithVertical } from './src/core/vertical/verticalScope.js';

const OWNER = { ownerType: 'RESTAURANT', ownerId: '6a8c1c8ddca4517139090d99' };
await mongoose.connect(process.env.MONGODB_URI);
await runWithVertical('food', async () => {
  const t = await listOwnerTokens({ ...OWNER, platform: 'mobile' });
  console.log('tokens:', t.length, t.map(x => x.slice(0, 24)));
  const r = await sendNotificationToOwner({
    ...OWNER,
    platform: 'mobile',
    payload: {
      title: 'MAAVA delivery check',
      body: 'If this lands, push delivery is fine.',
      androidChannelId: 'new_order_channel',
      data: { type: 'test' },
    },
  });
  console.log('result:', JSON.stringify(r).slice(0, 400));
});
await mongoose.disconnect();

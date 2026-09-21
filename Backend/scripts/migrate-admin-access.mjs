// One-off: move sub-admins from the old section permissions to per-sidebar-option access.
//
// - sub_admin with old permissions -> the options those sections covered, at
//   view (view-only sections) or edit (any other action).
// - adminType 'admin' (a legacy value the code never recognised; these accounts
//   were treated as sub-admins with no access) -> sub_admin with no access, so
//   they now show on the Sub Admin list and a super admin can give them access.
// Super admins are untouched.
//
// Usage: node --env-file=.env scripts/migrate-admin-access.mjs [--commit]
import mongoose from 'mongoose';
import { accessFromLegacyPermissions } from '../src/constants/adminAccess.js';

const commit = process.argv.includes('--commit');
await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
const admins = mongoose.connection.db.collection('food_admins');

for (const a of await admins.find({ adminType: { $ne: 'super_admin' } }).toArray()) {
    const set = {};
    if (a.adminType !== 'sub_admin') set.adminType = 'sub_admin';
    const hasAccess = a.access && Object.keys(a.access).length > 0;
    if (!hasAccess) set.access = accessFromLegacyPermissions(a.permissions || {});
    console.log(a.email, a.adminType, '->', JSON.stringify(set));
    if (commit && Object.keys(set).length) await admins.updateOne({ _id: a._id }, { $set: set });
}
console.log(commit ? 'committed' : 'dry run');
process.exit(0);

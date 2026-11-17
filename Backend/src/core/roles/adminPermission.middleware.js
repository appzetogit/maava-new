import { sendError } from '../../utils/response.js';
import { FoodAdmin } from '../admin/admin.model.js';
import {
    hasAccess,
    isSuperAdmin,
    levelForMethod,
    resolveAdminApiAccess,
    resolveLandingApiAccess,
} from '../../constants/adminAccess.js';

const hydrateAdmin = async (req) => {
    if (req.adminAccess) return req.adminAccess;
    const admin = await FoodAdmin.findById(req.user?.userId)
        .select('adminType access isActive isDeleted')
        .lean();
    req.adminAccess = admin;
    return admin;
};

/**
 * The one access check for admin APIs, run on every request.
 *
 * Super admins pass. A sub-admin needs view (GET) or edit (anything else) on a
 * sidebar option that owns the path; a path no option owns is refused, so a
 * new admin route is closed to sub-admins until it is added to adminAccess.js.
 * Access is read from the database each time, so a change or a deactivation
 * takes effect on the next request.
 */
const makeGate = (resolve) => async (req, res, next) => {
    try {
        if (req.method === 'OPTIONS') return next();
        if (!req.user?.userId || req.user?.role !== 'ADMIN') {
            return sendError(res, 401, 'Not authenticated');
        }
        const admin = await hydrateAdmin(req);
        if (!admin || admin.isDeleted || admin.isActive === false) {
            return sendError(res, 403, 'Admin account is inactive');
        }
        if (isSuperAdmin(admin)) return next();

        const keys = resolve(req.path, req.method);
        if (!hasAccess(admin.access, keys, levelForMethod(req.method))) {
            return sendError(res, 403, "You don't have access to this. Ask a super admin.");
        }
        return next();
    } catch (_error) {
        return sendError(res, 500, 'Permission check failed');
    }
};

export const requireAdminAccess = makeGate(resolveAdminApiAccess);
export const requireLandingAdminAccess = makeGate(resolveLandingApiAccess);

/** Super admins only, whatever the path. */
export const requireSuperAdmin = makeGate(() => 'super');

// The old per-section checks. requireAdminAccess now decides for sub-admins,
// so these only keep the authentication and inactive-account checks.
const passThrough = () => async (req, res, next) => {
    if (!req.user?.userId || req.user?.role !== 'ADMIN') {
        return sendError(res, 401, 'Not authenticated');
    }
    return next();
};
export const requireAdminPermission = passThrough;
export const requireAnyAdminPermission = passThrough;

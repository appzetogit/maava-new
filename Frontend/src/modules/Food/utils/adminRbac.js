import { getCurrentUser } from "@food/utils/auth";
import { ADMIN_ACCESS_GROUPS, accessKeyForPath } from "@food/utils/adminAccess";

// Super admins see everything. A sub-admin sees the sidebar options a super
// admin gave them, at "view" or "edit" (edit includes view). The backend
// enforces the same rules; this only decides what to show.

export function isSuperAdmin(adminUser) {
  const type = String(adminUser?.adminType || "").trim().toLowerCase();
  return type === "super_admin";
}

export function getAdminAccess(adminUser) {
  return adminUser?.effectiveAccess || adminUser?.access || {};
}

// "create", "delete" and "export" are all edits now.
const levelFor = (action) => (action === "view" ? "view" : "edit");

/** Can this admin [action] on the option [key]? */
export function canAdminAccess(adminUser, key, action = "view") {
  if (key === "open") return true;
  if (isSuperAdmin(adminUser)) return true;
  if (!key || key === "super") return false;
  const granted = getAdminAccess(adminUser)[key];
  return granted === "edit" || (levelFor(action) === "view" && granted === "view");
}

/** The option that owns an admin page ("super" / "open" / key / null). */
export function resolvePermissionSectionByPath(pathname = "") {
  return accessKeyForPath(pathname);
}

export function canAccessAdminPath(pathname, action = "view") {
  const adminUser = getCurrentUser("admin");
  const key = accessKeyForPath(pathname);
  if (!key) return isSuperAdmin(adminUser);
  return canAdminAccess(adminUser, key, action);
}

/** Should the current page show Add / Save / Delete buttons? */
export function canCurrentAdminAction(action = "view", pathname = "") {
  const adminUser = getCurrentUser("admin");
  const currentPath = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  const key = accessKeyForPath(currentPath);
  if (!key) return isSuperAdmin(adminUser);
  return canAdminAccess(adminUser, key, action);
}

export function findFirstAllowedAdminPath(adminUser) {
  if (isSuperAdmin(adminUser)) return "/admin/store";
  for (const group of ADMIN_ACCESS_GROUPS) {
    for (const item of group.items) {
      if (canAdminAccess(adminUser, item.key, "view")) {
        return item.pages[0].replace(/^=/, "");
      }
    }
  }
  return "/admin/store/profile";
}

export const FEATURE_SETTINGS_OWNER_EMAIL = "badeadmin@gmail.com"

/**
 * Accounts allowed into the SUPER POWERS sidebar section.
 *
 * An explicit list, not a role check: this section is deliberately narrower
 * than "any super admin". admin@maava.com is here because Power Scanning — the
 * page that sets the Mart theme colour — lives in this section, and that is the
 * account that operates it.
 */
const SUPER_POWERS_EMAILS = [FEATURE_SETTINGS_OWNER_EMAIL, "admin@maava.com"]

export function canAccessFeatureSettings(adminUser) {
  if ((adminUser?.adminType || "") === "super_admin") return true
  const email = String(adminUser?.email || "").trim().toLowerCase()
  return email === FEATURE_SETTINGS_OWNER_EMAIL
}

export function canAccessSuperPowers(adminUser) {
  const email = String(adminUser?.email || "").trim().toLowerCase()
  return SUPER_POWERS_EMAILS.includes(email)
}

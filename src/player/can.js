import { hasPermission } from "../../shared/permissions.js";

/**
 * Client-side permission check. This hides UI an Explorer cannot act on — it
 * never authorizes anything. Every guarded route re-checks server-side against
 * the database row, so a tampered payload buys nothing but a visible button
 * that returns 403.
 *
 * @param {unknown} access The `access` object from `/api/profile`.
 * @param {string} permission
 */
export function can(access, permission) {
  if (!access || typeof access !== "object") {
    return false;
  }
  const { role, permissions } = /** @type {Record<string, unknown>} */ (access);
  // Prefer the server's own list when it sent one; fall back to the shared
  // matrix so an older payload still gates correctly.
  if (Array.isArray(permissions)) {
    return permissions.includes(permission);
  }
  return hasPermission(role, permission);
}

/** @param {unknown} access */
export function isStaff(access) {
  return can(access, "audit:read");
}

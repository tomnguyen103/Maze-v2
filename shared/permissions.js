/**
 * The one permission matrix. Server and browser both read it; only the server
 * enforces it. `server/rbac.js` resolves a role from the database and checks
 * against this table, and `src/player/can.js` uses the same table to hide UI
 * an Explorer cannot act on.
 *
 * Roles are deliberately few. A permission exists only where a route actually
 * checks it — an unused permission is a claim the code does not back.
 */

/** @typedef {"admin" | "moderator" | "player"} Role */

/** Every role in the system, and the one assumed for an unknown account. */
export const ROLES = /** @type {const} */ (["admin", "moderator", "player"]);
export const DEFAULT_ROLE = "player";

/** @type {Record<Role, readonly string[]>} */
export const ROLE_PERMISSIONS = {
  admin: [
    "audit:read",
    "export:any",
    "questions:publish",
    "questions:read",
    "questions:write",
    "refunds:issue",
    "users:read",
    "users:roles:write",
    "webhooks:read"
  ],
  moderator: ["audit:read", "questions:read", "questions:write", "users:read"],
  // An Explorer's own play needs no permission. Their own data is reached
  // through ownership, not through the matrix.
  player: []
};

export const PERMISSIONS = /** @type {readonly string[]} */ (
  [...new Set(Object.values(ROLE_PERMISSIONS).flat())].sort()
);

/** @param {unknown} value @returns {value is Role} */
export function isRole(value) {
  return (
    typeof value === "string" &&
    /** @type {readonly string[]} */ (ROLES).includes(value)
  );
}

/**
 * @param {unknown} role Anything; an unknown or missing role resolves to the
 *   default rather than throwing, so a stale claim can never widen access.
 * @param {string} permission
 */
export function hasPermission(role, permission) {
  const resolved = isRole(role) ? role : DEFAULT_ROLE;
  return ROLE_PERMISSIONS[resolved].includes(permission);
}

/** @param {unknown} role */
export function permissionsFor(role) {
  return ROLE_PERMISSIONS[isRole(role) ? role : DEFAULT_ROLE];
}

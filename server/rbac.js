import {
  DEFAULT_ROLE,
  hasPermission,
  isRole,
  permissionsFor
} from "../shared/permissions.js";
import { safeErrorName } from "./safe-error-log.js";

export class RoleWriteError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "RoleWriteError";
  }
}

/**
 * Reads and writes the authoritative role. The Clerk claim is a mirror for UI
 * gating only and is never read here.
 *
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} pool
 */
export function createRoleStore(pool) {
  /**
   * @param {string} userId
   * @returns {Promise<import("../shared/permissions.js").Role>}
   */
  async function getRole(userId) {
    const result = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = $1",
      [userId]
    );
    const role = result.rows[0]?.role;
    // No row means player. An unrecognised value also means player, so a bad
    // write can never widen access.
    return isRole(role) ? role : DEFAULT_ROLE;
  }

  return {
    getRole,

    /**
     * @param {{ userId: string, role: string, grantedBy: string }} change
     */
    async setRole({ userId, role, grantedBy }) {
      if (!isRole(role)) {
        throw new RoleWriteError("Role is not supported.");
      }
      if (role === DEFAULT_ROLE) {
        // Absence of a row is the default, so revoking means deleting rather
        // than storing a redundant 'player' row. RETURNING gives the prior role
        // from the same statement that removed it.
        const deleted = await pool.query(
          "DELETE FROM user_roles WHERE user_id = $1 RETURNING role",
          [userId]
        );
        const removed = deleted.rows[0]?.role;
        return {
          previousRole: isRole(removed) ? removed : DEFAULT_ROLE,
          role
        };
      }
      // The read and the write share one snapshot, so two concurrent changes to
      // the same Explorer cannot both report the same `before` value.
      const upserted = await pool.query(
        `WITH previous AS (
           SELECT role FROM user_roles WHERE user_id = $1
         ),
         upserted AS (
           INSERT INTO user_roles (user_id, role, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE
             SET role = EXCLUDED.role,
                 granted_by = EXCLUDED.granted_by,
                 updated_at = now()
           RETURNING role
         )
         SELECT
           (SELECT role FROM previous) AS previous_role,
           (SELECT role FROM upserted) AS role`,
        [userId, role, grantedBy]
      );
      const previous = upserted.rows[0]?.previous_role;
      return {
        previousRole: isRole(previous) ? previous : DEFAULT_ROLE,
        role
      };
    }
  };
}

/**
 * Per-request role resolution. The cache lives for one request only: a role
 * change must take effect on the next request, never later.
 *
 * @param {{
 *   store: { getRole: (userId: string) => Promise<import("../shared/permissions.js").Role> },
 *   onFailure?: (details: { name: string }) => void
 * }} dependencies
 */
export function createRoleResolver({
  store,
  onFailure = (details) => console.error("[rbac] role lookup failed", details)
}) {
  return {
    /**
     * @param {import("node:http").IncomingMessage} request
     * @param {string} userId
     * @returns {Promise<import("../shared/permissions.js").Role>}
     */
    async roleFor(request, userId) {
      const cache = /** @type {{ __roles?: Map<string, string> }} */ (
        /** @type {unknown} */ (request)
      );
      cache.__roles ??= new Map();
      const cached = cache.__roles.get(userId);
      if (cached !== undefined) {
        return /** @type {import("../shared/permissions.js").Role} */ (cached);
      }
      /** @type {import("../shared/permissions.js").Role} */
      let role = DEFAULT_ROLE;
      try {
        role = await store.getRole(userId);
      } catch (error) {
        // Fail closed. An unreachable role table must not grant access.
        onFailure({ name: safeErrorName(error) });
      }
      cache.__roles.set(userId, role);
      return role;
    }
  };
}

/**
 * Route guard. Composes after Clerk authentication: 401 when there is no
 * Explorer, 403 when there is one without the permission.
 *
 * @param {{
 *   resolver: {
 *     roleFor: (
 *       request: import("node:http").IncomingMessage,
 *       userId: string
 *     ) => Promise<import("../shared/permissions.js").Role>
 *   },
 *   getUserId: (
 *     request: import("node:http").IncomingMessage
 *   ) => string | null | Promise<string | null>
 * }} dependencies
 */
export function createPermissionGuard({ resolver, getUserId }) {
  /**
   * @param {string} permission
   */
  return function requirePermission(permission) {
    /**
     * @param {import("node:http").IncomingMessage} request
     * @returns {Promise<
     *   { allowed: true, userId: string, role: import("../shared/permissions.js").Role } |
     *   { allowed: false, status: 401 | 403, error: string }
     * >}
     */
    return async function checkPermission(request) {
      const userId = await getUserId(request);
      if (!userId) {
        return {
          allowed: false,
          status: 401,
          error: "Sign in to continue."
        };
      }
      const role = await resolver.roleFor(request, userId);
      if (!hasPermission(role, permission)) {
        // Deliberately identical for "wrong role" and "no such permission":
        // the response must not describe the permission model to a caller who
        // is not entitled to it.
        return {
          allowed: false,
          status: 403,
          error: "You do not have access to that."
        };
      }
      return { allowed: true, userId, role };
    };
  };
}

/**
 * Shape handed to the browser so UI can hide what an Explorer cannot act on.
 * Never used to authorize.
 *
 * @param {import("../shared/permissions.js").Role} role
 */
export function publicAccess(role) {
  return { role, permissions: [...permissionsFor(role)] };
}

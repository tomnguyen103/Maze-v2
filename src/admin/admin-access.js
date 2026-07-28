import { isStaff } from "../player/can.js";
import { hasPermission } from "../../shared/permissions.js";

/**
 * @typedef {{ state: "allowed", access: unknown }
 *   | { state: "denied", reason: "role" | "profile" | "unavailable" }
 * } AdminAccess
 */

/**
 * Two-step gate for the `/admin` route.
 *
 * ADR 0015 mirrors the database-authoritative role into Clerk's
 * `publicMetadata` precisely so a client has a role signal before its first
 * profile fetch resolves. That mirror decides the *denial* — an Explorer with
 * no staff claim never causes a request. It never decides the *grant*: a
 * forged claim buys one profile fetch and a denial, and every admin route
 * re-checks server-side against the database row regardless.
 *
 * @param {{ mirroredRole: unknown, loadProfile: () => Promise<unknown> }} options
 * @returns {Promise<AdminAccess>}
 */
export async function resolveAdminAccess({ mirroredRole, loadProfile }) {
  if (!hasPermission(mirroredRole, "audit:read")) {
    return { state: "denied", reason: "role" };
  }
  /** @type {unknown} */
  let profile;
  try {
    profile = await loadProfile();
  } catch {
    // A shell rendered on an unconfirmed claim is worse than a retry prompt.
    return { state: "denied", reason: "unavailable" };
  }
  const access = /** @type {{ access?: unknown }} */ (profile ?? {}).access;
  if (!isStaff(access)) {
    return { state: "denied", reason: "profile" };
  }
  return { state: "allowed", access };
}

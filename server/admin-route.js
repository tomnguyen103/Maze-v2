import { DEFAULT_ROLE, isRole } from "../shared/permissions.js";
import { RoleWriteError } from "./rbac.js";
import { safeErrorName } from "./safe-error-log.js";
import { URL } from "node:url";

const MAX_BODY_BYTES = 4 * 1024;
const ROLE_PATH = /^\/api\/admin\/users\/([A-Za-z0-9_-]{1,255})\/role$/;

/** @param {string} pathname */
export function isAdminPath(pathname) {
  return pathname.startsWith("/api/admin/");
}

/**
 * Admin API. Every route is permission-checked and audited; there is no
 * unguarded path in this file.
 *
 * @param {{
 *   store: {
 *     setRole: (change: { userId: string, role: string, grantedBy: string }) => Promise<{
 *       previousRole: import("../shared/permissions.js").Role,
 *       role: string
 *     }>
 *   },
 *   requirePermission: (permission: string) => (
 *     request: import("node:http").IncomingMessage
 *   ) => Promise<
 *     { allowed: true, userId: string, role: import("../shared/permissions.js").Role } |
 *     { allowed: false, status: 401 | 403, error: string }
 *   >,
 *   recordAudit?: import("./audit.js").RecordAudit,
 *   mirrorRole?: (userId: string, role: string) => Promise<void>
 * }} dependencies
 */
export function createAdminHandler({
  store,
  requirePermission,
  recordAudit = async () => {},
  mirrorRole = async () => {}
}) {
  const checkRoleWrite = requirePermission("users:roles:write");

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function adminHandler(request, response, next) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!isAdminPath(pathname)) {
      next?.();
      return;
    }
    // The permission check runs before shape checks, so an unauthorized caller
    // cannot map the admin surface by reading 404s and 405s.
    const decision = await checkRoleWrite(request);
    if (!decision.allowed) {
      sendJson(response, decision.status, { error: decision.error });
      return;
    }

    const roleMatch = ROLE_PATH.exec(pathname);
    if (!roleMatch) {
      sendJson(response, 404, { error: "Unknown admin route." });
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, { error: "Use POST to change a role." });
      return;
    }

    const targetUserId = roleMatch[1];
    if (targetUserId === decision.userId) {
      // Belt and braces with the migration's CHECK. An admin editing their own
      // role is either a mistake or an escalation attempt; neither is served.
      sendJson(response, 403, { error: "You cannot change your own role." });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const role = body.role;
      if (!isRole(role)) {
        sendJson(response, 400, { error: "Role is not supported." });
        return;
      }
      const result = await store.setRole({
        userId: targetUserId,
        role,
        grantedBy: decision.userId
      });
      const changed = result.previousRole !== role;
      // The mirror is for client-side UI gating only, so a failure to write it
      // must not fail the request or leave the database unchanged.
      try {
        await mirrorRole(targetUserId, role);
      } catch (error) {
        console.error("[admin] role mirror failed", {
          name: safeErrorName(error)
        });
      }
      // No row for a no-op. Re-granting a role someone already holds changes
      // nothing, and an audit log padded with non-events is harder to read.
      if (changed) {
        // Best-effort, like the mirror: the role write has already committed, so
        // a failure here must not report 503 for a change that succeeded. A
        // retry would be a no-op and would write no row at all.
        try {
          await recordAudit(request, {
            actorId: decision.userId,
            actorRole: decision.role,
            action: role === DEFAULT_ROLE ? "role.revoke" : "role.grant",
            resource: { type: "user_role", id: targetUserId },
            before: { role: result.previousRole },
            after: { role }
          });
        } catch (error) {
          console.error("[admin] role audit failed", {
            name: safeErrorName(error)
          });
        }
      }
      sendJson(response, 200, { userId: targetUserId, role, changed });
    } catch (error) {
      if (error instanceof RoleWriteError || error instanceof AdminInputError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      console.error("[admin] role change failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 503, { error: "Role changes are unavailable." });
    }
  };
}

class AdminInputError extends Error {}

/** @param {import("node:http").IncomingMessage} request */
async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new AdminInputError("Request body is too large.");
    }
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new AdminInputError("Request body must be an object.");
    }
    return /** @type {Record<string, unknown>} */ (parsed);
  } catch (error) {
    if (error instanceof AdminInputError) {
      throw error;
    }
    throw new AdminInputError("Request body must be valid JSON.");
  }
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

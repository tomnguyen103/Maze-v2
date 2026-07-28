import { DEFAULT_ROLE, isRole } from "../shared/permissions.js";
import { RoleWriteError } from "./rbac.js";
import { safeErrorName } from "./safe-error-log.js";
import { URL } from "node:url";

const MAX_BODY_BYTES = 4 * 1024;
const ROLE_PATH = /^\/api\/admin\/users\/([A-Za-z0-9_-]{1,255})\/role$/;
const EXPORT_PATH = /^\/api\/admin\/users\/([A-Za-z0-9_-]{1,255})\/export$/;
const DEAD_WEBHOOKS_PATH = /^\/api\/admin\/webhooks\/dead$/;
const DEFAULT_DEAD_WEBHOOK_LIMIT = 100;
const MAX_DEAD_WEBHOOK_LIMIT = 200;

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
 *   exportUser?: (userId: string) => Promise<unknown>,
 *   listDeadWebhooks?: (options: { limit: number }) => Promise<
 *     Record<string, unknown>[]
 *   >,
 *   recordAudit?: import("./audit.js").RecordAudit,
 *   mirrorRole?: (userId: string, role: string) => Promise<void>
 * }} dependencies
 */
export function createAdminHandler({
  store,
  requirePermission,
  exportUser = async () => {
    throw new Error("Admin export is not configured.");
  },
  listDeadWebhooks = async () => {
    throw new Error("The webhook inbox is not configured.");
  },
  recordAudit = async () => {},
  mirrorRole = async () => {}
}) {
  // Each sub-path carries its own permission — they are separate grants — but
  // the check still runs before any shape check, so an unauthorized caller
  // cannot map the admin surface by reading 404s and 405s. An unmatched path is
  // checked against the fallback permission below, so it answers exactly as a
  // real route would.
  const routes = [
    { pattern: ROLE_PATH, permission: "users:roles:write", handle: handleRole },
    { pattern: EXPORT_PATH, permission: "export:any", handle: handleExport },
    {
      pattern: DEAD_WEBHOOKS_PATH,
      permission: "webhooks:read",
      handle: handleDeadWebhooks
    }
  ].map((route) => ({ ...route, check: requirePermission(route.permission) }));
  const checkUnknownRoute = requirePermission("users:roles:write");

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function adminHandler(request, response, next) {
    const url = new URL(request.url ?? "", "http://local");
    if (!isAdminPath(url.pathname)) {
      next?.();
      return;
    }
    const route = routes.find((candidate) =>
      candidate.pattern.test(url.pathname)
    );
    const decision = await (route?.check ?? checkUnknownRoute)(request);
    if (!decision.allowed) {
      sendJson(response, decision.status, { error: decision.error });
      return;
    }
    if (!route) {
      sendJson(response, 404, { error: "Unknown admin route." });
      return;
    }
    const match = /** @type {RegExpExecArray} */ (
      route.pattern.exec(url.pathname)
    );
    await route.handle(request, response, decision, match[1], url);
  };

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {{ userId: string, role: import("../shared/permissions.js").Role }} decision
   * @param {string} targetUserId
   */
  async function handleRole(request, response, decision, targetUserId) {
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, { error: "Use POST to change a role." });
      return;
    }

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
  }

  /**
   * GDPR/support export of any Explorer's data. Reuses the self-export builder
   * unchanged, so the payload an admin sees is byte-identical to the one the
   * Explorer can download themselves — one schema, one code path.
   *
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {{ userId: string, role: import("../shared/permissions.js").Role }} decision
   * @param {string} targetUserId
   */
  async function handleExport(request, response, decision, targetUserId) {
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      sendJson(response, 405, { error: "Use GET for an Explorer's export." });
      return;
    }
    try {
      const exported = await exportUser(targetUserId);
      // Sequenced before the body, like the self-export: reading another
      // Explorer's data always has its audit attempt behind it.
      await recordAudit(request, {
        actorId: decision.userId,
        actorRole: decision.role,
        action: "export.admin",
        resource: { type: "player_account", id: targetUserId }
      });
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.setHeader(
        "content-disposition",
        `attachment; filename="echo-maze-export-${targetUserId}.json"`
      );
      response.end(JSON.stringify(exported));
    } catch (error) {
      console.error("[admin] export failed", { name: safeErrorName(error) });
      sendJson(response, 503, { error: "Exports are unavailable." });
    }
  }

  /**
   * Dead deliveries the retry loop gave up on: each one is a provider state
   * change that was never applied, and until now `npm run webhooks:dead` was
   * the only way to see one. Read-only, so there is nothing to audit beyond the
   * request log.
   *
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {unknown} _decision
   * @param {string | undefined} _match
   * @param {URL} url
   */
  async function handleDeadWebhooks(request, response, _decision, _match, url) {
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      sendJson(response, 405, { error: "Use GET to list dead deliveries." });
      return;
    }
    try {
      const rows = await listDeadWebhooks({
        limit: readLimit(url.searchParams.get("limit"))
      });
      sendJson(response, 200, {
        deliveries: rows.map((row) => ({
          provider: String(row.provider),
          eventId: String(row.event_id),
          eventType: String(row.event_type),
          attempts: Number(row.attempts ?? 0),
          // The payload never leaves the database, so `last_error` is the only
          // diagnostic here; it is already a bare error name.
          lastError: row.last_error === null ? null : String(row.last_error),
          receivedAt:
            row.received_at instanceof Date
              ? row.received_at.toISOString()
              : String(row.received_at)
        }))
      });
    } catch (error) {
      console.error("[admin] dead webhook listing failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 503, {
        error: "Dead webhook deliveries are unavailable."
      });
    }
  }
}

/**
 * An out-of-range or unparseable limit is answered with the default rather than
 * a 400: this is a listing, and a bad page size is not worth a failed request.
 *
 * @param {string | null} raw
 */
function readLimit(raw) {
  const parsed = Number(raw);
  if (raw === null || raw === "" || !Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_DEAD_WEBHOOK_LIMIT;
  }
  return Math.min(parsed, MAX_DEAD_WEBHOOK_LIMIT);
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

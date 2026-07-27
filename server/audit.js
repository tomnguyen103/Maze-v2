import { hashClientIp } from "./audit-store.js";
import { safeErrorName } from "./safe-error-log.js";

/** Non-human actors. A webhook is never attributed to a player. */
export const SYSTEM_ACTORS = {
  system: "system",
  bootstrap: "system:bootstrap",
  stripe: "webhook:stripe",
  clerk: "webhook:clerk"
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,200}$/;

/**
 * @typedef {{
 *   actorId?: string | null,
 *   actorRole?: string | null,
 *   action: string,
 *   resource: { type: string, id?: string | null },
 *   before?: unknown,
 *   after?: unknown
 * }} AuditEventInput
 *
 * @typedef {(
 *   request: import("node:http").IncomingMessage,
 *   event: AuditEventInput
 * ) => Promise<void>} RecordAudit
 */

/**
 * Thin wrapper over the audit store. It must never throw into a request path:
 * a failed audit write is logged and counted, and the request continues, which
 * matches the safe-error-log philosophy already used for provider fallbacks.
 *
 * @param {{
 *   store: {
 *     appendAudit: (
 *       event: import("./audit-store.js").AuditEvent
 *     ) => Promise<unknown>
 *   },
 *   now?: () => Date,
 *   onFailure?: (
 *     details: { action: string, name: string, failures: number }
 *   ) => void
 * }} dependencies
 */
export function createAuditRecorder({
  store,
  now = () => new Date(),
  onFailure = (details) => console.error("[audit] append failed", details)
}) {
  let failures = 0;
  return {
    /**
     * @param {{
     *   actorId?: string | null,
     *   actorRole?: string | null,
     *   requestId?: string | null,
     *   ipHash?: string | null
     * }} context
     * @param {string} action
     * @param {{ type: string, id?: string | null }} resource
     * @param {unknown} [before]
     * @param {unknown} [after]
     */
    async recordAudit(context, action, resource, before, after) {
      try {
        await store.appendAudit({
          action,
          actorId: context.actorId ?? SYSTEM_ACTORS.system,
          actorRole:
            context.actorRole ?? (context.actorId ? "player" : "system"),
          after: after ?? null,
          before: before ?? null,
          createdAt: now().toISOString(),
          ipHash: context.ipHash ?? null,
          requestId: context.requestId ?? null,
          resourceId: resource.id ?? null,
          resourceType: resource.type
        });
      } catch (error) {
        failures += 1;
        // The running total ships with every failure line, so a silent audit
        // gap is visible in logs without a separate metrics surface.
        onFailure({ action, name: safeErrorName(error), failures });
      }
    },
    failureCount() {
      return failures;
    }
  };
}

/**
 * Request-shaped audit entry point handed to route handlers. Routes stay
 * unaware of the address salt and of the recorder's failure handling.
 *
 * @param {{
 *   recorder: {
 *     recordAudit: (
 *       context: Record<string, unknown>,
 *       action: string,
 *       resource: { type: string, id?: string | null },
 *       before?: unknown,
 *       after?: unknown
 *     ) => Promise<void>
 *   },
 *   salt?: string,
 *   today?: () => string
 * }} dependencies
 */
export function createRequestAuditor({
  recorder,
  salt = "",
  today = () => new Date().toISOString().slice(0, 10)
}) {
  /** @type {RecordAudit} */
  return async function recordAudit(request, event) {
    await recorder.recordAudit(
      auditContextFromRequest(request, {
        actorId: event.actorId,
        actorRole: event.actorRole,
        salt,
        date: today()
      }),
      event.action,
      event.resource,
      event.before,
      event.after
    );
  };
}

/** @param {import("node:http").IncomingMessage} request */
function clientAddress(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = header?.split(",")[0]?.trim();
  return first || request.socket?.remoteAddress || null;
}

/** @param {import("node:http").IncomingMessage} request */
export function requestIdFrom(request) {
  const header = request.headers["x-request-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value)
    ? value
    : null;
}

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {{
 *   actorId?: string | null,
 *   actorRole?: string | null,
 *   salt?: string,
 *   date?: string
 * }} [options]
 */
export function auditContextFromRequest(request, options = {}) {
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  return {
    actorId: options.actorId ?? null,
    actorRole: options.actorRole ?? null,
    requestId: requestIdFrom(request),
    ipHash: hashClientIp(clientAddress(request), {
      salt: options.salt ?? "",
      date
    })
  };
}

import { safeErrorName } from "./safe-error-log.js";
import { timingSafeEqual } from "node:crypto";
import { URL } from "node:url";

export const INTERNAL_RETRY_PATH = "/api/internal/webhook-retry";

/** @param {string} pathname */
export function isInternalPath(pathname) {
  return pathname.startsWith("/api/internal/");
}

/**
 * Constant-time compare so a caller cannot recover the secret by timing how
 * long a wrong guess takes.
 *
 * @param {string} candidate
 * @param {string} expected
 */
function secretMatches(candidate, expected) {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Internal, machine-only endpoints. Guarded by a shared secret rather than
 * Clerk, because the caller is Vercel cron and has no Explorer identity.
 *
 * @param {{
 *   inbox: {
 *     retryPending: (options?: { limit?: number }) => Promise<{
 *       claimed: number,
 *       processed: number,
 *       failed: number,
 *       dead: number
 *     }>
 *   } | null,
 *   cronSecret?: string
 * }} dependencies
 */
export function createInternalHandler({ inbox, cronSecret = "" }) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function internalHandler(request, response, next) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!isInternalPath(pathname)) {
      next?.();
      return;
    }
    if (!cronSecret) {
      // An unset secret must close the endpoint, never open it.
      sendJson(response, 503, { error: "Internal endpoints are not configured." });
      return;
    }
    const header = request.headers["x-cron-secret"];
    const supplied = Array.isArray(header) ? header[0] : header;
    if (typeof supplied !== "string" || !secretMatches(supplied, cronSecret)) {
      // Identical for a wrong secret and an unknown internal path, so the
      // surface cannot be mapped without the secret.
      sendJson(response, 401, { error: "Unauthorized." });
      return;
    }
    if (pathname !== INTERNAL_RETRY_PATH) {
      sendJson(response, 404, { error: "Unknown internal route." });
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, { error: "Use POST for the webhook retry." });
      return;
    }
    if (!inbox) {
      sendJson(response, 503, { error: "Webhook inbox is not configured." });
      return;
    }
    try {
      sendJson(response, 200, await inbox.retryPending());
    } catch (error) {
      console.error("[internal] webhook retry failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 503, { error: "Webhook retry is unavailable." });
    }
  };
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

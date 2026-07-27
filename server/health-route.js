import { URL } from "node:url";

export const HEALTH_PATH = "/api/health";
export const READY_PATH = "/api/ready";

/** @param {string} pathname */
export function isHealthPath(pathname) {
  return pathname === HEALTH_PATH || pathname === READY_PATH;
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

/**
 * Liveness and readiness. Liveness touches nothing — it answers "the process
 * runs". Readiness names each dependency separately so an operator can read
 * WHICH one is down from the response instead of guessing.
 *
 * @param {{
 *   version: string,
 *   checkDatabase: (() => Promise<unknown>) | null,
 *   stripeConfigured: boolean,
 *   clerkConfigured: boolean,
 *   checkTimeoutMs?: number
 * }} dependencies
 */
export function createHealthHandler({
  version,
  checkDatabase,
  stripeConfigured,
  clerkConfigured,
  checkTimeoutMs = 3000
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function healthHandler(request, response, next) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!isHealthPath(pathname)) {
      next?.();
      return;
    }
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      sendJson(response, 405, { error: "Use GET for health checks." });
      return;
    }
    if (pathname === HEALTH_PATH) {
      sendJson(response, 200, { status: "ok", version });
      return;
    }
    /** @type {"ok" | "failed" | "unconfigured"} */
    let database = "unconfigured";
    if (checkDatabase) {
      try {
        // Bounded: a database that accepts the connection but stalls must
        // surface as a 503 with detail, not hold this endpoint open until
        // the platform timeout.
        await Promise.race([
          checkDatabase(),
          new Promise((_resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("readiness check timed out")),
              checkTimeoutMs
            );
            timer.unref?.();
          })
        ]);
        database = "ok";
      } catch {
        // The failure reason may quote connection details; the per-check
        // status is all an operator needs from this endpoint.
        database = "failed";
      }
    }
    const checks = {
      database,
      stripe: stripeConfigured ? "ok" : "unconfigured",
      clerk: clerkConfigured ? "ok" : "unconfigured"
    };
    const ready = Object.values(checks).every((check) => check === "ok");
    sendJson(response, ready ? 200 : 503, {
      status: ready ? "ready" : "unavailable",
      version,
      checks
    });
  };
}

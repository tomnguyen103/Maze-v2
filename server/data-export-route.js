import { URL } from "node:url";
import { sendRateLimited } from "./rate-limit-request.js";
import { safeErrorName } from "./safe-error-log.js";

export const DATA_EXPORT_PATH = "/api/me/export";

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
 * `GET /api/me/export` — one Explorer downloads everything stored about
 * them. Auth required, metered by the `export.self` budget (2/hour), audited
 * as `export.self`.
 *
 * @param {{
 *   exportUser: (userId: string) => Promise<Record<string, unknown>>,
 *   getUserId: (request: import("node:http").IncomingMessage) =>
 *     string | null | Promise<string | null>,
 *   rateLimit: import("./rate-limit-request.js").RateLimit,
 *   recordAudit: import("./audit.js").RecordAudit
 * }} dependencies
 */
export function createDataExportHandler({
  exportUser,
  getUserId,
  rateLimit,
  recordAudit
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function dataExportHandler(request, response, next) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (pathname !== DATA_EXPORT_PATH) {
      next?.();
      return;
    }
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      sendJson(response, 405, { error: "Use GET for your data export." });
      return;
    }
    const userId = await getUserId(request);
    if (!userId) {
      sendJson(response, 401, { error: "Sign in to continue." });
      return;
    }
    const decision = await rateLimit("export.self", request, userId);
    if (!decision.allowed) {
      sendRateLimited(
        response,
        decision,
        "Your export was generated recently. Try again later."
      );
      return;
    }
    try {
      const exported = await exportUser(userId);
      // Sequenced before the body so a served export always has its audit
      // attempt behind it; the recorder itself never throws (phase 1).
      await recordAudit(request, {
        actorId: userId,
        action: "export.self",
        resource: { type: "player_account", id: userId }
      });
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.setHeader(
        "content-disposition",
        'attachment; filename="echo-maze-export.json"'
      );
      response.end(JSON.stringify(exported));
    } catch (error) {
      console.error("[export] could not build a data export", {
        name: safeErrorName(error)
      });
      sendJson(response, 503, {
        error: "Your export is unavailable right now. Try again later."
      });
    }
  };
}

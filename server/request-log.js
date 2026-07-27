import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { requestIdFrom } from "./audit.js";

/**
 * Returns the request's correlation id, generating one when the caller sent
 * none (or sent something that fails the audit layer's validation). The id is
 * written back onto the request headers so every downstream consumer — the
 * audit recorder in particular — reads the same value without new plumbing.
 *
 * @param {import("node:http").IncomingMessage} request
 */
export function ensureRequestId(request) {
  const inbound = requestIdFrom(request);
  if (inbound !== null) {
    return inbound;
  }
  const generated = randomUUID();
  request.headers["x-request-id"] = generated;
  return generated;
}

/**
 * Builds the per-request logging entry point: assigns the correlation id,
 * echoes it in the response, and emits exactly one structured line when the
 * response finishes.
 *
 * @param {{
 *   logger: { info: (fields: Record<string, unknown>, msg: string) => void },
 *   now?: () => number
 * }} dependencies
 */
export function createRequestLogger({
  logger,
  now = () => globalThis.performance.now()
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   */
  return function logRequest(request, response) {
    const requestId = ensureRequestId(request);
    response.setHeader("x-request-id", requestId);
    const started = now();
    // The query string can carry player-entered content; the pathname cannot.
    const route = new URL(request.url ?? "", "http://local").pathname;
    let logged = false;
    response.on("finish", () => {
      if (logged) {
        return;
      }
      logged = true;
      logger.info(
        {
          request_id: requestId,
          method: request.method,
          route,
          status: response.statusCode,
          duration_ms: Math.round(now() - started)
        },
        "request"
      );
    });
    return requestId;
  };
}

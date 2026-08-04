import { safeErrorName } from "./safe-error-log.js";
import { setRetryAfter } from "./http-retry.js";

/**
 * Run one async route handler and make sure its rejection goes somewhere.
 *
 * Express 5 forwards a rejected promise only when the handler is returned or
 * awaited. These dispatches happen inside an authentication callback, so the
 * promise belongs to nobody: a rejection used to reach `unhandledRejection`,
 * which under Node's default takes the whole process down. On Vercel that
 * ends one invocation; on the persistent server it ends the game for every
 * player currently in a Run.
 *
 * @param {(
 *   request: import("node:http").IncomingMessage,
 *   response: import("node:http").ServerResponse,
 *   next?: (() => void) | undefined
 * ) => unknown} handler
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 * @param {((error?: unknown) => void) | undefined} [next]
 */
export async function dispatch(handler, request, response, next) {
  try {
    await handler(request, response, next);
  } catch (error) {
    console.error("[dispatch] route handler rejected", {
      name: safeErrorName(error),
      method: request.method,
      // The path only — a query string can carry an Explorer identifier.
      route: (request.url ?? "").split("?")[0]
    });
    if (response.writableEnded || response.headersSent) {
      // Nothing left to say: a handler that answered and then rejected has
      // already given the caller its answer.
      return;
    }
    if (next) {
      // Express's error pipeline owns the response from here.
      next(error);
      return;
    }
    response.statusCode = 503;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    setRetryAfter(response, 503);
    response.end(JSON.stringify({ error: "Something went wrong. Try again." }));
  }
}

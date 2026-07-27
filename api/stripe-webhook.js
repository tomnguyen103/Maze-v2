import { createPlayerApi } from "../server/player-api.js";

export const config = {
  api: {
    bodyParser: false
  }
};

const handler = createPlayerApi();

const SAFE_SUBPATH = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,120}$/;

/**
 * A rewritten sub-path is attacker-controlled. `..` normalizes away in
 * `new URL()`, producing a pathname no namespace recognises, which reaches a
 * `next?.()` that does not exist in a serverless function and hangs until the
 * platform timeout. Only a plain segment shape is allowed through.
 *
 * @param {string | null} value
 */
function safeSubpath(value) {
  if (value === null || value === "") {
    return "";
  }
  return SAFE_SUBPATH.test(value) && !value.includes("..") ? value : null;
}

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function stripeWebhook(request, response) {
  // This function also hosts /api/internal/*. Not for elegance: the project is
  // at Vercel's 12-function Hobby ceiling, so a new endpoint has to share an
  // existing function. Webhook delivery and the webhook retry loop are the same
  // subsystem, so this is the least surprising host for it.
  const url = new URL(request.url ?? "", "http://local");
  const rawPath = url.searchParams.get("_internalPath");
  if (rawPath !== null) {
    const internalPath = safeSubpath(rawPath);
    if (internalPath === null) {
      response.statusCode = 404;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "Unknown internal route." }));
      return undefined;
    }
    url.searchParams.delete("_internalPath");
    const query = url.searchParams.toString();
    request.url = `/api/internal/${internalPath}${query ? `?${query}` : ""}`;
  }
  return handler(request, response);
}

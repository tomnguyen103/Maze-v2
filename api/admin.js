import { createPlayerApi } from "../server/player-api.js";

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
 * Vercel rewrites every `/api/admin/*` path here, carrying the original path in
 * `_adminPath` so the shared router can match it. Without this the admin routes
 * would exist only under `npm start` and the Vite dev server.
 *
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function admin(request, response) {
  const url = new URL(request.url ?? "", "http://local");
  const adminPath = safeSubpath(url.searchParams.get("_adminPath"));
  if (adminPath === null) {
    response.statusCode = 404;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Unknown admin route." }));
    return undefined;
  }
  url.searchParams.delete("_adminPath");
  const query = url.searchParams.toString();
  // Always rebuilt, never trusted, and always with the trailing slash: a direct
  // hit to `/api/admin` would otherwise miss `isAdminPath`, fall through to a
  // `next?.()` that has no callback in a serverless function, and hang until the
  // platform timeout instead of answering 401.
  request.url = `/api/admin/${adminPath}${query ? `?${query}` : ""}`;
  return handler(request, response);
}

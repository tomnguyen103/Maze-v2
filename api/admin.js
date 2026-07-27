import { createPlayerApi } from "../server/player-api.js";

const handler = createPlayerApi();

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
  const adminPath = url.searchParams.get("_adminPath") ?? "";
  url.searchParams.delete("_adminPath");
  const query = url.searchParams.toString();
  // Always rebuilt, never trusted, and always with the trailing slash: a direct
  // hit to `/api/admin` would otherwise miss `isAdminPath`, fall through to a
  // `next?.()` that has no callback in a serverless function, and hang until the
  // platform timeout instead of answering 401.
  request.url = `/api/admin/${adminPath}${query ? `?${query}` : ""}`;
  return handler(request, response);
}

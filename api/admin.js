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
  const adminPath = url.searchParams.get("_adminPath");
  if (adminPath) {
    url.searchParams.delete("_adminPath");
    const query = url.searchParams.toString();
    // Rebuilt rather than trusted: only the path shape the router recognises can
    // get through, so a crafted `_adminPath` cannot reach another route.
    request.url = `/api/admin/${adminPath}${query ? `?${query}` : ""}`;
  }
  return handler(request, response);
}

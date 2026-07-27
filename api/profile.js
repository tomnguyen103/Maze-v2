import { createPlayerApi } from "../server/player-api.js";

const handler = createPlayerApi();

const ME_ROUTES = new Set(["export"]);

/**
 * Also hosts `/api/me/export` via a vercel.json rewrite: the project sits at
 * the 12-function Hobby ceiling, so the personal-data namespace has to share
 * an existing function. The rewritten value is attacker-controlled; anything
 * but the known routes answers 404 rather than reaching a `next?.()` that
 * does not exist in a serverless function.
 *
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function profile(request, response) {
  const url = new URL(request.url ?? "", "http://local");
  const meRoute = url.searchParams.get("_meRoute");
  if (meRoute !== null) {
    if (!ME_ROUTES.has(meRoute)) {
      response.statusCode = 404;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "Unknown personal-data route." }));
      return undefined;
    }
    request.url = `/api/me/${meRoute}`;
  }
  return handler(request, response);
}

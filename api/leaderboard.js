import { createPlayerApi } from "../server/player-api.js";

const handler = createPlayerApi();

const HEALTH_ROUTES = new Set(["health", "ready"]);

/**
 * Also hosts `/api/health` and `/api/ready` via vercel.json rewrites: the
 * project sits at the 12-function Hobby ceiling, so the health namespace has
 * to share an existing function. The rewritten value is attacker-controlled;
 * anything but the two known routes answers 404 rather than reaching a
 * `next?.()` that does not exist in a serverless function.
 *
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function leaderboard(request, response) {
  const url = new URL(request.url ?? "", "http://local");
  const healthRoute = url.searchParams.get("_healthRoute");
  if (healthRoute !== null) {
    if (!HEALTH_ROUTES.has(healthRoute)) {
      response.statusCode = 404;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "Unknown health route." }));
      return undefined;
    }
    request.url = `/api/${healthRoute}`;
  }
  return handler(request, response);
}

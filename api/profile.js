import { createPlayerApi } from "../server/player-api.js";

const handler = createPlayerApi();

const ME_ROUTES = new Set(["export", "settings"]);
const OFFLINE_ROUTES = new Set(["receipt"]);
const CLASSROOM_ROUTE_PATTERN =
  /^(?:root|org_[A-Za-z0-9_-]{3,120}\/(?:domain|invitations|progress|expeditions(?:\/exped_[A-Za-z0-9_-]{3,120}\/(?:status|license|capacity|progress|grants|grants\/outcome))?))$/;

/**
 * Also hosts `/api/me/*` via validated vercel.json rewrites: the project sits at
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
  const offlineRoute = url.searchParams.get("_offlineRoute");
  const classroomRoute = url.searchParams.get("_classroomRoute");
  if (
    [meRoute, offlineRoute, classroomRoute].filter((route) => route !== null)
      .length > 1
  ) {
    response.statusCode = 404;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Unknown shared route." }));
    return undefined;
  }
  if (offlineRoute !== null) {
    if (!OFFLINE_ROUTES.has(offlineRoute)) {
      response.statusCode = 404;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "Unknown Offline route." }));
      return undefined;
    }
    request.url = `/api/offline/${offlineRoute}`;
  }
  if (meRoute !== null) {
    if (!ME_ROUTES.has(meRoute)) {
      response.statusCode = 404;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "Unknown personal-data route." }));
      return undefined;
    }
    request.url = `/api/me/${meRoute}`;
  }
  if (classroomRoute !== null) {
    if (!CLASSROOM_ROUTE_PATTERN.test(classroomRoute)) {
      response.statusCode = 404;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "Unknown Classroom route." }));
      return undefined;
    }
    request.url =
      classroomRoute === "root"
        ? "/api/classrooms"
        : `/api/classrooms/${classroomRoute}`;
  }
  return handler(request, response);
}

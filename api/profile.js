import { createPlayerApi } from "../server/player-api.js";

const handler = createPlayerApi();

const ME_ROUTES = new Set(["export", "settings"]);
const OFFLINE_ROUTES = new Set(["receipt", "submission"]);
/**
 * Every sub-resource `server/classroom-route.js` serves under one Class
 * Expedition. The guard below is the only thing standing between a rewritten
 * path and dispatch, so a sub-resource missing from this list answers 404 in
 * production while working locally, where Express reaches the route directly.
 * `constellation` — the one correctly k-anonymized Teacher view — was missing.
 * `tests/audit-correctness.test.js` fails if the two lists drift apart again.
 */
export const CLASS_EXPEDITION_SUB_RESOURCES = Object.freeze([
  "status",
  "license",
  "capacity",
  "progress",
  "constellation",
  "grants",
  "grants/outcome"
]);

const CLASSROOM_ROUTE_PATTERN = new RegExp(
  `^(?:root|org_[A-Za-z0-9_-]{3,120}/(?:domain|invitations|progress|expeditions(?:/exped_[A-Za-z0-9_-]{3,120}/(?:${CLASS_EXPEDITION_SUB_RESOURCES.join("|")}))?))$`
);

/**
 * Also hosts `/api/me/*`, `/api/classrooms/*`, and `/api/echo-fossils` via
 * validated vercel.json rewrites: the project sits at the 12-function Hobby
 * ceiling, so these namespaces share an existing function. The rewritten
 * values are attacker-controlled; anything but the known routes answers 404
 * rather than reaching a `next?.()` that does not exist in a serverless
 * function.
 *
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function profile(request, response) {
  const url = new URL(request.url ?? "", "http://local");
  const meRoute = url.searchParams.get("_meRoute");
  const offlineRoute = url.searchParams.get("_offlineRoute");
  const classroomRoute = url.searchParams.get("_classroomRoute");
  const fossilRoute = url.searchParams.get("_fossilRoute");
  if (
    [meRoute, offlineRoute, classroomRoute, fossilRoute]
      .filter((route) => route !== null)
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
  if (fossilRoute !== null) {
    if (fossilRoute !== "echo-fossils") {
      response.statusCode = 404;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "Unknown fossil route." }));
      return undefined;
    }
    url.searchParams.delete("_fossilRoute");
    const query = url.searchParams.toString();
    request.url = `/api/echo-fossils${query ? `?${query}` : ""}`;
  }
  return handler(request, response);
}

import { createPlayerApi } from "../server/player-api.js";

const handler = createPlayerApi();

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function access(request, response) {
  const url = new URL(request.url ?? "", "http://local");
  const route = url.searchParams.get("_accessRoute");
  if (route === "config" || route === "runs") {
    url.searchParams.delete("_accessRoute");
    const query = url.searchParams.toString();
    request.url = `/api/access/${route}${query ? `?${query}` : ""}`;
  }
  return handler(request, response);
}

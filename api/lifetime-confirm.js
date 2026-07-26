import { createPlayerApi } from "../server/player-api.js";

const handler = createPlayerApi();

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function lifetimeConfirm(request, response) {
  return handler(request, response);
}

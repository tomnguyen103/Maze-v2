import { createPlayerApi } from "../server/player-api.js";

export const config = {
  api: {
    bodyParser: false
  }
};

const handler = createPlayerApi();

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function stripeWebhook(request, response) {
  return handler(request, response);
}

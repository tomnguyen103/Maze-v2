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
  // This function also hosts /api/internal/*. Not for elegance: the project is
  // at Vercel's 12-function Hobby ceiling, so a new endpoint has to share an
  // existing function. Webhook delivery and the webhook retry loop are the same
  // subsystem, so this is the least surprising host for it.
  const url = new URL(request.url ?? "", "http://local");
  const internalPath = url.searchParams.get("_internalPath");
  if (internalPath !== null) {
    url.searchParams.delete("_internalPath");
    const query = url.searchParams.toString();
    request.url = `/api/internal/${internalPath}${query ? `?${query}` : ""}`;
  }
  return handler(request, response);
}

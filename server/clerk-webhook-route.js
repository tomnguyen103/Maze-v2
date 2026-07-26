import { verifyWebhook } from "@clerk/express/webhooks";
import { URL } from "node:url";
import { safeErrorName } from "./safe-error-log.js";

export const CLERK_WEBHOOK_PATH = "/api/clerk-webhook";
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * @param {{
 *   deleteUser: (userId: string) => Promise<void>,
 *   signingSecret?: string,
 *   verifyEvent?: (request: import("node:http").IncomingMessage, body: Buffer) => Promise<{ type: string, data: { id?: unknown } }>
 * }} dependencies
 */
export function createClerkWebhookHandler({
  deleteUser,
  signingSecret = "",
  verifyEvent
}) {
  const verify = verifyEvent ?? (async (request, body) => {
    if (!signingSecret) {
      throw new WebhookConfigurationError();
    }
    const expressRequest = Object.assign(request, { body });
    return verifyWebhook(
      /** @type {import("express").Request} */ (expressRequest),
      { signingSecret }
    );
  });

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function clerkWebhookHandler(request, response, next) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (pathname !== CLERK_WEBHOOK_PATH) {
      next?.();
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, { error: "Use POST for Clerk webhooks." });
      return;
    }
    let event;
    try {
      event = await verify(request, await readRawBody(request));
    } catch (error) {
      if (error instanceof WebhookConfigurationError) {
        sendJson(response, 503, {
          error: "Clerk account-deletion webhook is not configured."
        });
        return;
      }
      console.error("[clerk-webhook] Event rejected", {
        name: safeErrorName(error)
      });
      sendJson(response, 400, { error: "Clerk webhook verification failed." });
      return;
    }
    if (event.type === "user.deleted") {
      const userId = event.data.id;
      if (typeof userId !== "string" || !userId) {
        sendJson(response, 400, { error: "Clerk deletion event is invalid." });
        return;
      }
      try {
        await deleteUser(userId);
      } catch (error) {
        console.error("[clerk-webhook] Account deletion failed", {
          name: safeErrorName(error)
        });
        sendJson(response, 503, {
          error: "Account deletion is temporarily unavailable."
        });
        return;
      }
    }
    sendJson(response, 200, { received: true });
  };
}

class WebhookConfigurationError extends Error {}

/** @param {import("node:http").IncomingMessage} request */
async function readRawBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      throw new Error("Clerk webhook body is too large.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

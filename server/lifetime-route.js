import {
  LifetimeVerificationError,
  LifetimeWebhookVerificationError
} from "./lifetime-domain.js";
import {
  LifetimeOwnershipError
} from "./lifetime-service.js";

export const LIFETIME_PATHS = new Set([
  "/api/lifetime-checkout",
  "/api/lifetime-confirm",
  "/api/stripe-webhook"
]);

class LifetimeInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "LifetimeInputError";
  }
}

/**
 * @param {{
 *   getUserId: (request: import("node:http").IncomingMessage) => string | null,
 *   service: {
 *     confirmCheckout: (userId: string, sessionId: string) => Promise<Record<string, unknown>>,
 *     createCheckout: (userId: string) => Promise<Record<string, unknown>>,
 *     processWebhook: (rawBody: Buffer, signature: string) => Promise<Record<string, unknown>>
 *   }
 * }} dependencies
 */
export function createLifetimeHandler({ getUserId, service }) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} next
   */
  return async function lifetimeHandler(
    request,
    response,
    next = undefined
  ) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!LIFETIME_PATHS.has(pathname)) {
      next?.();
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    if (pathname === "/api/stripe-webhook") {
      await handleWebhook(request, response);
      return;
    }
    const userId = getUserId(request);
    if (!userId) {
      sendJson(response, 401, { error: "Sign in to continue." });
      return;
    }
    try {
      if (pathname === "/api/lifetime-checkout") {
        const body = await readJsonBody(request, true);
        if (Object.keys(body).length > 0) {
          throw new LifetimeInputError(
            "Checkout does not accept commercial fields."
          );
        }
        sendJson(response, 200, await service.createCheckout(userId));
        return;
      }
      const body = await readJsonBody(request, false);
      if (
        Object.keys(body).length !== 1 ||
        !validSessionId(body.sessionId)
      ) {
        throw new LifetimeInputError(
          "A valid Checkout Session is required."
        );
      }
      sendJson(
        response,
        200,
        await service.confirmCheckout(userId, String(body.sessionId))
      );
    } catch (error) {
      if (error instanceof LifetimeInputError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      if (error instanceof LifetimeOwnershipError) {
        sendJson(response, 403, { error: "Checkout ownership was not verified." });
        return;
      }
      if (error instanceof LifetimeVerificationError) {
        sendJson(response, 400, { error: "Payment was not verified." });
        return;
      }
      console.error("[lifetime] browser request failed", {
        name: error instanceof Error ? error.name : "UnknownError"
      });
      sendJson(response, 503, {
        error: "Lifetime Membership is unavailable. Your progress is safe."
      });
    }
  };

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   */
  async function handleWebhook(request, response) {
    const signature = request.headers["stripe-signature"];
    if (typeof signature !== "string" || !signature) {
      sendJson(response, 400, { error: "Webhook rejected." });
      return;
    }
    try {
      const rawBody = await readRawBody(request, 512 * 1024);
      await service.processWebhook(rawBody, signature);
      sendJson(response, 200, { received: true });
    } catch (error) {
      if (error instanceof LifetimeWebhookVerificationError) {
        sendJson(response, 400, { error: "Webhook rejected." });
        return;
      }
      console.error("[lifetime] webhook processing failed", {
        name: error instanceof Error ? error.name : "UnknownError"
      });
      sendJson(response, 503, { error: "Webhook unavailable." });
    }
  }
}

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {boolean} allowEmpty
 */
async function readJsonBody(request, allowEmpty) {
  const raw = await readRawBody(request, 4096);
  if (raw.length === 0 && allowEmpty) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LifetimeInputError("Request body must be an object.");
    }
    return /** @type {Record<string, unknown>} */ (parsed);
  } catch (error) {
    if (error instanceof LifetimeInputError) {
      throw error;
    }
    throw new LifetimeInputError("Request body must be valid JSON.");
  }
}

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {number} maximumBytes
 */
async function readRawBody(request, maximumBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) {
      throw new LifetimeInputError("Request body is too large.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/** @param {unknown} value */
function validSessionId(value) {
  return (
    typeof value === "string" &&
    /^cs_[A-Za-z0-9_]{6,255}$/.test(value)
  );
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {Record<string, unknown>} body
 */
function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

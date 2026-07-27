import {
  LifetimeVerificationError,
  LifetimeWebhookVerificationError
} from "./lifetime-domain.js";
import {
  LifetimeOwnershipError
} from "./lifetime-service.js";
import { safeErrorName } from "./safe-error-log.js";
import { SYSTEM_ACTORS } from "./audit.js";
import { UNMETERED } from "./rate-limit-config.js";
import { sendRateLimited } from "./rate-limit-request.js";

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
 *   },
 *   recordAudit?: import("./audit.js").RecordAudit,
 *   rateLimit?: import("./rate-limit-request.js").RateLimit
 * }} dependencies
 */
export function createLifetimeHandler({
  getUserId,
  service,
  recordAudit = async () => {},
  rateLimit = async () => UNMETERED
}) {
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
        const decision = await rateLimit("lifetime.checkout", request, userId);
        if (!decision.allowed) {
          sendRateLimited(
            response,
            decision,
            "Too many Checkout attempts. Try again shortly."
          );
          return;
        }
        const body = await readJsonBody(request, true);
        if (Object.keys(body).length > 0) {
          throw new LifetimeInputError(
            "Checkout does not accept commercial fields."
          );
        }
        const checkout = await service.createCheckout(userId);
        await recordAudit(request, {
          actorId: userId,
          action: "lifetime.checkout",
          resource: {
            type: "lifetime_purchase",
            id: String(checkout.purchaseId ?? userId)
          },
          after: { state: checkout.state ?? null }
        });
        sendJson(response, 200, checkout);
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
      const confirmation = await service.confirmCheckout(
        userId,
        String(body.sessionId)
      );
      await recordAudit(request, {
        actorId: userId,
        action: "lifetime.confirm",
        resource: {
          type: "lifetime_purchase",
          id: String(confirmation.purchaseId ?? userId)
        },
        after: {
          outcome: confirmation.outcome ?? null,
          state: confirmation.state ?? null
        }
      });
      sendJson(response, 200, confirmation);
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
        name: safeErrorName(error)
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
      const result = await service.processWebhook(rawBody, signature);
      await recordAudit(request, {
        actorId: SYSTEM_ACTORS.stripe,
        actorRole: "system",
        action: "lifetime.webhook",
        resource: {
          type: "lifetime_purchase",
          id: result.purchaseId ? String(result.purchaseId) : null
        },
        after: {
          eventType: result.eventType ?? null,
          outcome: result.outcome ?? null
        }
      });
      sendJson(response, 200, { received: true });
    } catch (error) {
      if (error instanceof LifetimeWebhookVerificationError) {
        sendJson(response, 400, { error: "Webhook rejected." });
        return;
      }
      console.error("[lifetime] webhook processing failed", {
        name: safeErrorName(error)
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

import { verifyWebhook } from "@clerk/express/webhooks";
import { URL } from "node:url";
import { safeErrorName } from "./safe-error-log.js";
import { SYSTEM_ACTORS } from "./audit.js";
import { verifiedEmailDomain } from "./classroom-domain.js";

export const CLERK_WEBHOOK_PATH = "/api/clerk-webhook";
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * @param {{
 *   deleteUser: (userId: string) => Promise<void>,
 *   signingSecret?: string,
 *   verifyEvent?: (
 *     request: import("node:http").IncomingMessage,
 *     body: Buffer
 *   ) => Promise<{
 *     type: string,
 *     timestamp?: unknown,
 *     data: Record<string, unknown>
 *   }>,
 *   recordAudit?: import("./audit.js").RecordAudit,
 *   inbox?: {
 *     receive: (delivery: {
 *       provider: "clerk",
 *       eventId: string,
 *       eventType: string,
 *       payload: unknown
 *     }) => Promise<{ duplicate: boolean, processed: boolean }>
 *   } | null
 * }} dependencies
 */
export function createClerkWebhookHandler({
  deleteUser,
  signingSecret = "",
  verifyEvent,
  recordAudit = async () => {},
  inbox = null
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
    let payload;
    try {
      payload = deliveryPayloadFrom(event);
    } catch {
      sendJson(response, 400, { error: "Clerk webhook event is invalid." });
      return;
    }
    if (!payload) {
      sendJson(response, 200, { received: true });
      return;
    }

    // The svix delivery id is the stable key a redelivery reuses, so every
    // authority-changing event must use it when the durable inbox is present.
    const deliveryId = deliveryIdFrom(request);
    if (inbox) {
      if (!deliveryId) {
        sendJson(response, 400, {
          error: "Clerk webhook delivery id is invalid."
        });
        return;
      }
      /** @type {{ duplicate: boolean }} */
      let outcome;
      try {
        outcome = await inbox.receive({
          provider: "clerk",
          eventId: deliveryId,
          eventType: event.type,
          payload
        });
      } catch (error) {
        // The router dispatches this handler with `void`, so an unhandled
        // rejection writes no response at all and the request hangs until the
        // platform timeout. 503 tells Clerk to redeliver, which is exactly
        // right when the delivery was never stored.
        console.error("[clerk-webhook] Inbox write failed", {
          name: safeErrorName(error)
        });
        sendJson(response, 503, {
          error: "Clerk synchronization is temporarily unavailable."
        });
        return;
      }
      // 200 either way: the delivery is stored and owned by our retry loop, so
      // Clerk must stop redelivering it.
      sendJson(response, 200, {
        received: true,
        duplicate: outcome.duplicate
      });
      return;
    }

    if (event.type === "user.deleted") {
      const userId = /** @type {{ id: string }} */ (payload).id;
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
      await recordAudit(request, {
        actorId: SYSTEM_ACTORS.clerk,
        actorRole: "system",
        action: "user.delete",
        resource: { type: "player_account", id: userId }
      });
      sendJson(response, 200, { received: true });
      return;
    }

    sendJson(response, 503, {
      error: "Classroom synchronization is not configured."
    });
  };
}

/**
 * Minimize verified Clerk events before they enter the retryable inbox. Public
 * profile fields, emails, images, and metadata are not Classroom authority.
 *
 * @param {{
 *   type: string,
 *   timestamp?: unknown,
 *   data: object
 * }} event
 */
function deliveryPayloadFrom(event) {
  const data = /** @type {Record<string, unknown>} */ (event.data ?? {});
  if (event.type === "user.deleted") {
    return { id: requiredString(data.id) };
  }
  if (event.type === "user.created" || event.type === "user.updated") {
    const primaryEmailAddressId = data.primary_email_address_id;
    const emailAddresses = Array.isArray(data.email_addresses)
      ? data.email_addresses
      : [];
    const primary = emailAddresses.find((value) => {
      const email = /** @type {Record<string, unknown>} */ (value ?? {});
      const verification = /** @type {Record<string, unknown>} */ (
        email.verification ?? {}
      );
      return (
        email.id === primaryEmailAddressId &&
        verification.status === "verified"
      );
    });
    const email = /** @type {Record<string, unknown>} */ (primary ?? {});
    const emailDomain = verifiedEmailDomain(email.email_address);
    if (!emailDomain) {
      return null;
    }
    return {
      id: requiredString(data.id),
      emailDomain,
      occurredAt: eventTimestamp(event)
    };
  }
  if (
    event.type === "organization.created" ||
    event.type === "organization.updated"
  ) {
    return {
      id: requiredString(data.id),
      name: requiredString(data.name),
      occurredAt: eventTimestamp(event)
    };
  }
  if (event.type === "organization.deleted") {
    return {
      id: requiredString(data.id),
      occurredAt: eventTimestamp(event)
    };
  }
  if (
    event.type === "organizationMembership.created" ||
    event.type === "organizationMembership.updated" ||
    event.type === "organizationMembership.deleted"
  ) {
    const organization =
      /** @type {Record<string, unknown>} */ (data.organization ?? {});
    const publicUserData =
      /** @type {Record<string, unknown>} */ (data.public_user_data ?? {});
    return {
      id: requiredString(data.id),
      classroomId: requiredString(organization.id),
      userId: requiredString(publicUserData.user_id),
      role: requiredString(data.role),
      occurredAt: eventTimestamp(event)
    };
  }
  return null;
}

/** @param {{ timestamp?: unknown, data: object }} event */
function eventTimestamp(event) {
  const data = /** @type {Record<string, unknown>} */ (event.data);
  const candidate = event.timestamp ?? data.updated_at;
  if (
    typeof candidate !== "number" ||
    !Number.isSafeInteger(candidate) ||
    candidate <= 0
  ) {
    throw new Error("Clerk event timestamp is invalid.");
  }
  return candidate;
}

/** @param {unknown} value */
function requiredString(value) {
  if (typeof value !== "string" || !value) {
    throw new Error("Clerk event field is invalid.");
  }
  return value;
}

/** @param {import("node:http").IncomingMessage} request */
function deliveryIdFrom(request) {
  const header = request.headers["svix-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,255}$/.test(value)
    ? value
    : null;
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

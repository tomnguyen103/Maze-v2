import { RATE_LIMIT_BUDGET_NAMES } from "./rate-limit-config.js";

const EVENT_SCHEMA = {
  lifetime_checkout: {
    outcome: ["created", "reused"]
  },
  lifetime_confirmation: {
    outcome: [
      "activated",
      "duplicate",
      "ignored",
      "processed",
      "stale",
      "unlinked"
    ]
  },
  lifetime_webhook: {
    eventType: [
      "charge.dispute.closed",
      "charge.dispute.created",
      "charge.dispute.funds_reinstated",
      "checkout.session.async_payment_failed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.completed",
      "checkout.session.expired",
      "refund.created",
      "refund.updated"
    ],
    outcome: ["duplicate", "ignored", "processed", "stale", "unlinked"]
  },
  run_access_decision: {
    accessState: ["blocked", "free", "member", "membership-blocked"],
    duplicate: [false, true],
    enforcementEnabled: [false, true],
    outcome: ["admitted", "blocked", "unmetered"]
  },
  run_access_error: {
    category: ["temporary"]
  },
  // High volume by nature, so this is a product event rather than an audit row.
  // Deliberately carries no caller identity. The budget list is derived, so a
  // new budget cannot silently drop its events.
  rate_limit_hit: {
    budget: RATE_LIMIT_BUDGET_NAMES,
    scope: ["ip", "user"]
  }
};

/**
 * Only events whose truth lives on the server are forwarded: a client can
 * fabricate its own analytics, but not a confirmed checkout or a Run Access
 * decision. High-volume telemetry (rate limits) deliberately stays local.
 */
const SERVER_TRUSTED_EVENTS = new Set([
  "lifetime_confirmation",
  "run_access_decision"
]);

/**
 * Env-gated PostHog delivery. Returns null when unconfigured. The forwarder
 * receives events AFTER schema filtering, so identities can never travel even
 * if a call site passes them, and delivery is fire-and-forget with a bounded
 * timeout — analytics must never block or fail a request.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {(url: string, options: {
 *   method: string,
 *   headers: Record<string, string>,
 *   body: string,
 *   signal: AbortSignal
 * }) => Promise<unknown>} [fetcher]
 */
export function createPostHogForwarder(
  env = globalThis.process.env,
  fetcher = globalThis.fetch
) {
  const apiKey = env.POSTHOG_API_KEY;
  if (!apiKey) {
    return null;
  }
  const host = env.POSTHOG_HOST || "https://us.i.posthog.com";
  /** @param {Record<string, unknown>} event */
  return function forwardProductEvent(event) {
    const name = String(event.event ?? "");
    if (!SERVER_TRUSTED_EVENTS.has(name)) {
      return;
    }
    const properties = /** @type {Record<string, unknown>} */ ({
      ...event,
      source: "server"
    });
    delete properties.event;
    // try/catch as well as .catch: a fetcher can throw synchronously (for
    // example on a malformed POSTHOG_HOST) and that must not reach the
    // request path either.
    try {
      void fetcher(`${host}/capture/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          event: name,
          // Aggregate-only by design: product events carry no caller
          // identity, so there is no honest per-user distinct id to send.
          distinct_id: "echo-maze-server",
          properties
        }),
        signal: AbortSignal.timeout(3000)
      }).catch(() => {});
    } catch {
      // Delivery is best-effort; nothing to do.
    }
  };
}

/**
 * @param {{
 *   write?: (event: Record<string, unknown>) => void,
 *   forward?: ((event: Record<string, unknown>) => void) | null
 * }} [dependencies]
 */
export function createProductEventRecorder({
  write = (event) => console.info(`[product] ${JSON.stringify(event)}`),
  forward = null
} = {}) {
  /**
   * @param {string} eventName
   * @param {Record<string, unknown>} fields
   */
  return function recordProductEvent(eventName, fields) {
    if (!Object.hasOwn(EVENT_SCHEMA, eventName)) {
      return;
    }
    const schema =
      EVENT_SCHEMA[/** @type {keyof typeof EVENT_SCHEMA} */ (eventName)];
    /** @type {Record<string, unknown>} */
    const event = { event: eventName };
    for (const [field, allowedValues] of Object.entries(schema)) {
      if (
        Object.hasOwn(fields, field) &&
        allowedValues.includes(
          /** @type {never} */ (fields[field])
        )
      ) {
        event[field] = fields[field];
      }
    }
    write(event);
    forward?.(event);
  };
}

export const recordProductEvent = createProductEventRecorder({
  forward: createPostHogForwarder()
});

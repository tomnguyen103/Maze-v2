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
 * @param {{ write?: (event: Record<string, unknown>) => void }} [dependencies]
 */
export function createProductEventRecorder({
  write = (event) => console.info(`[product] ${JSON.stringify(event)}`)
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
  };
}

export const recordProductEvent = createProductEventRecorder();

import {
  LIFETIME_AMOUNT,
  LIFETIME_CURRENCY
} from "../shared/lifetime-product.js";

export {
  LIFETIME_AMOUNT,
  LIFETIME_CURRENCY
} from "../shared/lifetime-product.js";

export class LifetimeVerificationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "LifetimeVerificationError";
  }
}

export class LifetimeWebhookVerificationError extends Error {
  constructor() {
    super("Stripe webhook signature is invalid.");
    this.name = "LifetimeWebhookVerificationError";
  }
}

/**
 * @param {Record<string, unknown>} checkout
 * @param {{ priceId: string, purchaseId: string, userId: string }} expected
 */
export function verifyLifetimeCheckout(checkout, expected) {
  const checks = [
    [checkout.livemode === false, "Checkout must use Stripe test mode."],
    [checkout.mode === "payment", "Checkout must be a one-time payment."],
    [checkout.paymentStatus === "paid", "Checkout is not paid."],
    [checkout.amountTotal === LIFETIME_AMOUNT, "Checkout amount is invalid."],
    [checkout.currency === LIFETIME_CURRENCY, "Checkout currency is invalid."],
    [checkout.quantity === 1, "Checkout quantity is invalid."],
    [checkout.priceId === expected.priceId, "Checkout Price is invalid."],
    [nonEmptyString(checkout.purchaseId), "Checkout purchase is missing."],
    [checkout.purchaseId === expected.purchaseId, "Checkout purchase is invalid."],
    [nonEmptyString(checkout.ownerId), "Checkout owner is missing."],
    [checkout.ownerId === expected.userId, "Checkout owner is invalid."],
    [nonEmptyString(checkout.sessionId), "Checkout Session is missing."],
    [nonEmptyString(checkout.paymentIntentId), "PaymentIntent is missing."]
  ];
  const failed = checks.find(([valid]) => !valid);
  if (failed) {
    throw new LifetimeVerificationError(String(failed[1]));
  }
  return checkout;
}

/**
 * @param {{
 *   id?: unknown,
 *   type?: unknown,
 *   created?: unknown,
 *   data?: { object?: Record<string, unknown> }
 * }} event
 */
export function normalizeLifetimeProviderEvent(event) {
  if (
    !nonEmptyString(event.id) ||
    !nonEmptyString(event.type) ||
    !Number.isInteger(event.created) ||
    !event.data?.object
  ) {
    return null;
  }
  const base = {
    eventCreated: Number(event.created),
    eventId: String(event.id),
    eventType: String(event.type)
  };
  const object = event.data.object;
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    return nonEmptyString(object.id)
      ? { ...base, kind: "checkout-paid", sessionId: String(object.id) }
      : null;
  }
  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    return nonEmptyString(object.id)
      ? { ...base, kind: "checkout-closed", sessionId: String(object.id) }
      : null;
  }

  const paymentIntentId = providerId(object.payment_intent);
  if (!paymentIntentId) {
    return null;
  }
  if (
    (event.type === "refund.created" || event.type === "refund.updated") &&
    object.status === "succeeded"
  ) {
    return {
      ...base,
      kind: "refund",
      paymentIntentId
    };
  }
  if (event.type === "charge.dispute.created") {
    return {
      ...base,
      kind: "entitlement",
      paymentIntentId,
      state: "disputed"
    };
  }
  if (
    event.type === "charge.dispute.funds_reinstated" ||
    (event.type === "charge.dispute.closed" &&
      (object.status === "won" || object.status === "warning_closed"))
  ) {
    return {
      ...base,
      kind: "entitlement",
      paymentIntentId,
      state: "active"
    };
  }
  return null;
}

/** @param {unknown} value */
function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

/** @param {unknown} value */
function providerId(value) {
  if (nonEmptyString(value)) {
    return String(value);
  }
  if (
    value &&
    typeof value === "object" &&
    nonEmptyString(Reflect.get(value, "id"))
  ) {
    return String(Reflect.get(value, "id"));
  }
  return null;
}

import {
  LIFETIME_AMOUNT,
  LIFETIME_CURRENCY,
  LifetimeVerificationError,
  LifetimeWebhookVerificationError
} from "./lifetime-domain.js";

/**
 * @param {{
 *   appOrigin: string,
 *   priceId: string,
 *   stripe: any,
 *   webhookSecret: string
 * }} configuration
 */
export function createStripeLifetimeProvider(configuration) {
  const { appOrigin, priceId, stripe, webhookSecret } = configuration;
  return {
    /**
     * Starts the provider refund. Entitlement is intentionally left alone:
     * the signed Stripe webhook is the authority that moves it to refunded.
     *
     * @param {{ paymentIntentId: string, purchaseId: string }} payment
     */
    async issueRefund(payment) {
      const refund = await stripe.refunds.create(
        { payment_intent: payment.paymentIntentId },
        { idempotencyKey: `echo-maze-refund:${payment.purchaseId}` }
      );
      return {
        refundId: String(refund.id ?? ""),
        status: String(refund.status ?? "pending")
      };
    },

    /**
     * @param {{ purchaseId: string, userId: string }} purchase
     */
    async createCheckout(purchase) {
      const metadata = {
        clerk_user_id: purchase.userId,
        purchase_id: purchase.purchaseId
      };
      const session = await stripe.checkout.sessions.create(
        {
          allow_promotion_codes: false,
          cancel_url: `${appOrigin}/play?checkout=canceled`,
          client_reference_id: purchase.purchaseId,
          expand: ["line_items.data.price", "payment_intent"],
          line_items: [{ price: priceId, quantity: 1 }],
          metadata,
          mode: "payment",
          payment_intent_data: { metadata },
          success_url:
            `${appOrigin}/play?checkout=success&session_id={CHECKOUT_SESSION_ID}`
        },
        { idempotencyKey: `echo-maze-lifetime:${purchase.purchaseId}` }
      );
      const normalized = normalizeStripeCheckoutSession(session);
      validateCreatedCheckout(normalized, purchase, priceId);
      const checkoutUrl = String(session.url ?? "");
      const checkoutHost = safeHostname(checkoutUrl);
      if (checkoutHost !== "checkout.stripe.com") {
        throw new LifetimeVerificationError("Stripe Checkout URL is invalid.");
      }
      return {
        checkoutUrl,
        sessionId: normalized.sessionId
      };
    },

    /** @param {string} sessionId */
    async retrieveCheckout(sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price", "payment_intent"]
      });
      return normalizeStripeCheckoutSession(session);
    },

    /** @param {string} sessionId */
    async retrieveCheckoutLink(sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {});
      const checkoutUrl = String(session.url ?? "");
      if (
        session.status !== "open" ||
        safeHostname(checkoutUrl) !== "checkout.stripe.com"
      ) {
        throw new LifetimeVerificationError(
          "The previous Checkout Session is no longer open."
        );
      }
      return checkoutUrl;
    },

    /** @param {string} paymentIntentId */
    async retrievePaymentReference(paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ["latest_charge"] }
      );
      const ownerId = String(
        metadataValue(paymentIntent.metadata, "clerk_user_id")
      );
      const purchaseId = String(
        metadataValue(paymentIntent.metadata, "purchase_id")
      );
      const charge =
        paymentIntent.latest_charge &&
        typeof paymentIntent.latest_charge === "object"
          ? paymentIntent.latest_charge
          : null;
      if (
        paymentIntent.livemode === true ||
        paymentIntent.status !== "succeeded" ||
        Number(paymentIntent.amount_received) !== LIFETIME_AMOUNT ||
        paymentIntent.currency !== LIFETIME_CURRENCY ||
        !charge ||
        !ownerId ||
        !purchaseId
      ) {
        throw new LifetimeVerificationError(
          "PaymentIntent purchase reference is invalid."
        );
      }
      const state =
        charge.refunded === true ||
        Number(charge.amount_refunded) >= LIFETIME_AMOUNT
          ? "refunded"
          : charge.disputed === true
            ? "disputed"
            : "paid";
      return { ownerId, purchaseId, state };
    },

    /** @param {Buffer} rawBody @param {string} signature */
    constructWebhookEvent(rawBody, signature) {
      try {
        return stripe.webhooks.constructEvent(
          rawBody,
          signature,
          webhookSecret
        );
      } catch {
        throw new LifetimeWebhookVerificationError();
      }
    }
  };
}

/** @param {Record<string, unknown>} session */
export function normalizeStripeCheckoutSession(session) {
  const lineItems =
    session.line_items &&
    typeof session.line_items === "object" &&
    Array.isArray(Reflect.get(session.line_items, "data"))
      ? Reflect.get(session.line_items, "data")
      : [];
  const lineItem = lineItems[0];
  const price =
    lineItem && typeof lineItem === "object"
      ? Reflect.get(lineItem, "price")
      : null;
  return {
    amountTotal: Number(session.amount_total),
    currency: String(session.currency ?? ""),
    livemode: session.livemode === true,
    mode: String(session.mode ?? ""),
    ownerId: String(
      metadataValue(session.metadata, "clerk_user_id")
    ),
    paymentIntentId: providerId(session.payment_intent),
    paymentStatus: String(session.payment_status ?? ""),
    priceId: providerId(price),
    purchaseId: String(
      metadataValue(session.metadata, "purchase_id")
    ),
    quantity: Number(
      lineItem && typeof lineItem === "object"
        ? Reflect.get(lineItem, "quantity")
        : Number.NaN
    ),
    sessionId: String(session.id ?? ""),
    sessionStatus: String(session.status ?? "")
  };
}

/**
 * @param {ReturnType<typeof normalizeStripeCheckoutSession>} checkout
 * @param {{ purchaseId: string, userId: string }} purchase
 * @param {string} priceId
 */
function validateCreatedCheckout(checkout, purchase, priceId) {
  if (
    checkout.livemode ||
    checkout.mode !== "payment" ||
    checkout.amountTotal !== LIFETIME_AMOUNT ||
    checkout.currency !== LIFETIME_CURRENCY ||
    checkout.priceId !== priceId ||
    checkout.quantity !== 1 ||
    checkout.purchaseId !== purchase.purchaseId ||
    checkout.ownerId !== purchase.userId ||
    checkout.sessionStatus !== "open" ||
    !checkout.sessionId
  ) {
    throw new LifetimeVerificationError(
      "Stripe Checkout configuration does not match Lifetime Membership."
    );
  }
}

/** @param {unknown} metadata @param {string} key */
function metadataValue(metadata, key) {
  return metadata && typeof metadata === "object"
    ? Reflect.get(metadata, key) ?? ""
    : "";
}

/** @param {unknown} value */
function providerId(value) {
  if (typeof value === "string") {
    return value;
  }
  return value && typeof value === "object"
    ? String(Reflect.get(value, "id") ?? "")
    : "";
}

/** @param {string} value */
function safeHostname(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.hostname : "";
  } catch {
    return "";
  }
}

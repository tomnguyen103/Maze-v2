import { randomUUID } from "node:crypto";
import { normalizeLifetimeProviderEvent } from "./lifetime-domain.js";

export const EXPEDITION_PURCHASE_KIND = "class_expedition_license";

export class ExpeditionBillingError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ExpeditionBillingError";
  }
}

/**
 * Class Expedition License billing. Mirrors the Lifetime Stripe architecture:
 * structural test-mode gates, server-side product identity, per-purchase
 * idempotency keys, and store-then-process webhook handling. No USD amount is
 * a code constant — the ledger records what the environment-configured test
 * price charged, and no price is proposed before the documented cost model.
 *
 * @param {{
 *   appOrigin: string,
 *   basePriceId: string,
 *   extensionPriceId: string,
 *   stripe: any,
 *   store: {
 *     reserveLicense: (
 *       sponsorUserId: string,
 *       input: {
 *         purchaseId: string,
 *         expeditionId: string,
 *         kind: "base" | "extension",
 *         priceId: string
 *       }
 *     ) => Promise<unknown>,
 *     activateLicense: (input: {
 *       purchaseId: string,
 *       checkoutSessionId: string,
 *       paymentIntentId: string,
 *       amount: number,
 *       currency: string,
 *       eventCreated: number
 *     }) => Promise<unknown>,
 *     transitionLicense: (
 *       purchaseId: string,
 *       status: "paid" | "refunded" | "disputed" | "expired" | "failed",
 *       eventCreated: number
 *     ) => Promise<unknown>
 *   },
 *   createId?: () => string
 * }} dependencies
 */
export function createClassExpeditionBilling({
  appOrigin,
  basePriceId,
  extensionPriceId,
  stripe,
  store,
  createId = randomUUID
}) {
  /** @param {string} paymentIntentId */
  async function purchaseFromPaymentIntent(paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const metadata = objectMetadata(intent);
    if (metadata?.purchase_kind !== EXPEDITION_PURCHASE_KIND) {
      return null;
    }
    const purchaseId = String(metadata.purchase_id ?? "");
    return purchaseId ? { purchaseId } : null;
  }

  return {
    /**
     * @param {{
     *   userId: string,
     *   classroomId: string,
     *   expeditionId: string,
     *   kind: "base" | "extension"
     * }} purchase
     */
    async createLicenseCheckout({ userId, classroomId, expeditionId, kind }) {
      void classroomId;
      const priceId = kind === "base" ? basePriceId : extensionPriceId;
      const purchaseId = createId();
      await store.reserveLicense(userId, {
        purchaseId,
        expeditionId,
        kind,
        priceId
      });
      const metadata = {
        purchase_kind: EXPEDITION_PURCHASE_KIND,
        purchase_id: purchaseId,
        expedition_id: expeditionId,
        license_kind: kind,
        sponsor_user_id: userId
      };
      const session = await stripe.checkout.sessions.create(
        {
          allow_promotion_codes: false,
          cancel_url: `${appOrigin}/class?expedition-checkout=canceled`,
          client_reference_id: purchaseId,
          expand: ["line_items.data.price", "payment_intent"],
          line_items: [{ price: priceId, quantity: 1 }],
          metadata,
          mode: "payment",
          payment_intent_data: { metadata },
          success_url:
            `${appOrigin}/class?expedition-checkout=success&session_id={CHECKOUT_SESSION_ID}`
        },
        { idempotencyKey: `echo-maze-expedition:${purchaseId}` }
      );
      const checkoutUrl = String(session.url ?? "");
      if (
        session.livemode === true ||
        session.mode !== "payment" ||
        session.status !== "open" ||
        Number(session.amount_total) <= 0 ||
        safeHostname(checkoutUrl) !== "checkout.stripe.com" ||
        objectMetadata(session)?.purchase_id !== purchaseId
      ) {
        throw new ExpeditionBillingError(
          "Stripe Checkout configuration does not match the Class Expedition License."
        );
      }
      return { checkoutUrl, purchaseId };
    },

    /**
     * Whether a verified Stripe event belongs to Class Expedition billing.
     * Checkout events carry the purchase kind directly; refund and dispute
     * objects only reference the PaymentIntent, so its metadata decides.
     *
     * @param {unknown} verified
     */
    async ownsEvent(verified) {
      const object = eventObject(verified);
      if (!object) {
        return false;
      }
      const eventType =
        verified && typeof verified === "object"
          ? String(Reflect.get(verified, "type") ?? "")
          : "";
      if (eventType.startsWith("checkout.session.")) {
        return (
          objectMetadata(object)?.purchase_kind === EXPEDITION_PURCHASE_KIND
        );
      }
      const paymentIntentId = providerId(object.payment_intent);
      if (!paymentIntentId) {
        return false;
      }
      return (await purchaseFromPaymentIntent(paymentIntentId)) !== null;
    },

    /** @param {unknown} verified */
    async processVerifiedEvent(verified) {
      const normalized = normalizeLifetimeProviderEvent(
        /** @type {Parameters<typeof normalizeLifetimeProviderEvent>[0]} */ (
          verified
        )
      );
      if (!normalized) {
        return { outcome: "ignored" };
      }
      if (normalized.kind === "checkout-paid" && "sessionId" in normalized) {
        const session = await stripe.checkout.sessions.retrieve(
          normalized.sessionId,
          { expand: ["line_items.data.price", "payment_intent"] }
        );
        const metadata = objectMetadata(session);
        const purchaseId = String(metadata?.purchase_id ?? "");
        if (
          session.livemode === true ||
          session.mode !== "payment" ||
          session.payment_status !== "paid" ||
          session.currency !== "usd" ||
          Number(session.amount_total) <= 0 ||
          metadata?.purchase_kind !== EXPEDITION_PURCHASE_KIND ||
          !purchaseId
        ) {
          throw new ExpeditionBillingError(
            "Checkout Session is not a paid test-mode Class Expedition License."
          );
        }
        await store.activateLicense({
          purchaseId,
          checkoutSessionId: String(session.id ?? ""),
          paymentIntentId: providerId(session.payment_intent) ?? "",
          amount: Number(session.amount_total),
          currency: String(session.currency),
          eventCreated: normalized.eventCreated
        });
        return { outcome: "activated", purchaseId };
      }
      if (normalized.kind === "checkout-closed" && "sessionId" in normalized) {
        const object = eventObject(verified);
        const purchaseId = String(
          objectMetadata(object)?.purchase_id ?? ""
        );
        if (!purchaseId) {
          return { outcome: "ignored" };
        }
        await store.transitionLicense(
          purchaseId,
          "expired",
          normalized.eventCreated
        );
        return { outcome: "expired", purchaseId };
      }
      if ("paymentIntentId" in normalized) {
        const purchase = await purchaseFromPaymentIntent(
          normalized.paymentIntentId
        );
        if (!purchase) {
          return { outcome: "ignored" };
        }
        const status =
          normalized.kind === "refund"
            ? "refunded"
            : "state" in normalized && normalized.state === "disputed"
              ? "disputed"
              : "paid";
        await store.transitionLicense(
          purchase.purchaseId,
          status,
          normalized.eventCreated
        );
        return { outcome: status, purchaseId: purchase.purchaseId };
      }
      return { outcome: "ignored" };
    }
  };
}

/** @param {unknown} verified */
function eventObject(verified) {
  if (!verified || typeof verified !== "object") {
    return null;
  }
  const data = Reflect.get(verified, "data");
  const object =
    data && typeof data === "object" ? Reflect.get(data, "object") : null;
  return object && typeof object === "object"
    ? /** @type {Record<string, unknown>} */ (object)
    : null;
}

/** @param {unknown} value */
function objectMetadata(value) {
  const metadata =
    value && typeof value === "object" ? Reflect.get(value, "metadata") : null;
  return metadata && typeof metadata === "object"
    ? /** @type {Record<string, unknown>} */ (metadata)
    : null;
}

/** @param {unknown} value */
function providerId(value) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (value && typeof value === "object") {
    const id = Reflect.get(value, "id");
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }
  return null;
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

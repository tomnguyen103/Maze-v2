import { randomUUID } from "node:crypto";
import {
  LifetimeVerificationError,
  normalizeLifetimeProviderEvent,
  verifyLifetimeCheckout
} from "./lifetime-domain.js";

export class LifetimeOwnershipError extends Error {
  constructor() {
    super("Checkout Session does not belong to this account.");
    this.name = "LifetimeOwnershipError";
  }
}

/**
 * @param {{
 *   config: { priceId: string },
 *   createId?: () => string,
 *   provider: {
 *     constructWebhookEvent: (body: Buffer, signature: string) => Promise<unknown>,
 *     createCheckout: (purchase: { purchaseId: string, userId: string }) => Promise<{ checkoutUrl: string, sessionId: string }>,
 *     retrieveCheckout: (sessionId: string) => Promise<Record<string, unknown>>,
 *     retrieveCheckoutLink: (sessionId: string) => Promise<string>,
 *     retrievePaymentReference: (paymentIntentId: string) => Promise<{ ownerId: string, purchaseId: string, state: string }>
 *   },
 *   recordEvent?: (eventName: string, fields: Record<string, unknown>) => void,
 *   store: {
 *     abandonCheckout: (purchaseId: string, sessionId: string) => Promise<boolean>,
 *     activatePurchase: (checkout: Record<string, unknown>, event: null | { eventCreated: number, eventId: string, eventType: string }) => Promise<Record<string, unknown>>,
 *     attachCheckout: (purchaseId: string, sessionId: string) => Promise<void>,
 *     closeCheckout: (event: Record<string, unknown>) => Promise<Record<string, unknown>>,
 *     findPurchaseBySession: (sessionId: string) => Promise<null | { playerId: string, priceId: string, purchaseId: string, sessionId: string, status: string }>,
 *     reservePurchase: (userId: string, purchaseId: string, priceId: string) => Promise<{ purchaseId: string, sessionId: string | null, state: string }>,
 *     transitionEntitlement: (event: Record<string, unknown>) => Promise<Record<string, unknown>>
 *   }
 * }} dependencies
 */
export function createLifetimeService({
  config,
  createId = randomUUID,
  provider,
  recordEvent = () => {},
  store
}) {
  return {
    /** @param {string} userId */
    async createCheckout(userId) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const reservation = await store.reservePurchase(
          userId,
          createId(),
          config.priceId
        );
        if (reservation.state === "member") {
          return {
            checkoutUrl: null,
            purchaseId: reservation.purchaseId,
            state: "lifetime_active"
          };
        }
        if (reservation.state === "membership-blocked") {
          // `refunded` is absorbing: no later provider event restores
          // membership from it, so a second Checkout would take a parent's
          // money and change nothing. This is a state a person resolves.
          return {
            checkoutUrl: null,
            purchaseId: reservation.purchaseId,
            state: "membership_blocked"
          };
        }
        if (reservation.sessionId) {
          try {
            const checkoutUrl = await provider.retrieveCheckoutLink(
              reservation.sessionId
            );
            recordEvent("lifetime_checkout", { outcome: "reused" });
            return {
              checkoutUrl,
              purchaseId: reservation.purchaseId,
              state: "checkout_open"
            };
          } catch (error) {
            if (!(error instanceof LifetimeVerificationError)) {
              throw error;
            }
            const existing = await provider.retrieveCheckout(
              reservation.sessionId
            );
            if (existing.paymentStatus === "paid") {
              verifyLifetimeCheckout(existing, {
                priceId: config.priceId,
                purchaseId: reservation.purchaseId,
                userId
              });
              const payment = await provider.retrievePaymentReference(
                String(existing.paymentIntentId)
              );
              verifyPaymentIdentity(existing, payment);
              if (payment.state !== "paid") {
                throw new LifetimeVerificationError(
                  "Payment is no longer eligible for Lifetime Membership."
                );
              }
              const result = await store.activatePurchase(existing, null);
              if (result.lifetime === true) {
                return {
                  checkoutUrl: null,
                  purchaseId: reservation.purchaseId,
                  state: "lifetime_active"
                };
              }
              throw new LifetimeVerificationError(
                "Checkout could not be recovered."
              );
            }
            if (existing.sessionStatus !== "expired") {
              throw error;
            }
            await store.abandonCheckout(
              reservation.purchaseId,
              reservation.sessionId
            );
            if (attempt === 1) {
              throw error;
            }
            continue;
          }
        }
        const checkout = await provider.createCheckout({
          purchaseId: reservation.purchaseId,
          userId
        });
        await store.attachCheckout(
          reservation.purchaseId,
          checkout.sessionId
        );
        recordEvent("lifetime_checkout", { outcome: "created" });
        return {
          checkoutUrl: checkout.checkoutUrl,
          purchaseId: reservation.purchaseId,
          state: "checkout_open"
        };
      }
      throw new LifetimeVerificationError(
        "Checkout could not be recovered."
      );
    },

    /** @param {string} userId @param {string} sessionId */
    async confirmCheckout(userId, sessionId) {
      const purchase = await store.findPurchaseBySession(sessionId);
      if (!purchase || purchase.playerId !== userId) {
        throw new LifetimeOwnershipError();
      }
      const checkout = await provider.retrieveCheckout(sessionId);
      verifyLifetimeCheckout(checkout, {
        priceId: purchase.priceId,
        purchaseId: purchase.purchaseId,
        userId
      });
      const payment = await provider.retrievePaymentReference(
        String(checkout.paymentIntentId)
      );
      verifyPaymentIdentity(checkout, payment);
      if (payment.state !== "paid") {
        throw new LifetimeVerificationError(
          "Payment is no longer eligible for Lifetime Membership."
        );
      }
      const result = await store.activatePurchase(checkout, null);
      recordEvent("lifetime_confirmation", {
        outcome: result.outcome ?? "activated"
      });
      return result;
    },

    /**
     * Signature verification, split out so the webhook inbox can store a
     * delivery before processing it. Anything that fails here was never a
     * genuine delivery and must not be stored.
     *
     * @param {Buffer} rawBody
     * @param {string} signature
     */
    async verifyWebhook(rawBody, signature) {
      return provider.constructWebhookEvent(rawBody, signature);
    },

    /** @param {Buffer} rawBody @param {string} signature */
    async processWebhook(rawBody, signature) {
      return this.processVerifiedWebhook(
        await provider.constructWebhookEvent(rawBody, signature)
      );
    },

    /**
     * Everything after verification. The inline path and the retry loop share
     * exactly this, so a retried delivery takes the same route as a fresh one.
     *
     * @param {unknown} verified
     */
    async processVerifiedWebhook(verified) {
      const normalized = normalizeLifetimeProviderEvent(
        /** @type {Parameters<typeof normalizeLifetimeProviderEvent>[0]} */ (
          verified
        )
      );
      if (!normalized) {
        recordEvent("lifetime_webhook", { outcome: "ignored" });
        return { outcome: "ignored" };
      }
      if (
        normalized.kind === "checkout-closed" &&
        "sessionId" in normalized
      ) {
        const result = await store.closeCheckout({
          eventCreated: normalized.eventCreated,
          eventId: normalized.eventId,
          eventType: normalized.eventType,
          sessionId: normalized.sessionId
        });
        recordEvent("lifetime_webhook", {
          eventType: normalized.eventType,
          outcome: result.outcome
        });
        return result;
      }
      if ("paymentIntentId" in normalized) {
        const reference = await provider.retrievePaymentReference(
          normalized.paymentIntentId
        );
        const state = normalized.kind === "refund"
          ? reference.state === "refunded"
            ? "refunded"
            : null
          : "state" in normalized
            ? normalized.state
            : null;
        const result = await store.transitionEntitlement({
          eventCreated: normalized.eventCreated,
          eventId: normalized.eventId,
          eventType: normalized.eventType,
          ownerId: reference.ownerId,
          paymentIntentId: normalized.paymentIntentId,
          purchaseId: reference.purchaseId,
          state
        });
        recordEvent("lifetime_webhook", {
          eventType: normalized.eventType,
          outcome: result.outcome
        });
        return result;
      }
      const checkout = await provider.retrieveCheckout(
        normalized.sessionId
      );
      verifyLifetimeCheckout(checkout, {
        priceId: config.priceId,
        purchaseId: String(checkout.purchaseId),
        userId: String(checkout.ownerId)
      });
      const payment = await provider.retrievePaymentReference(
        String(checkout.paymentIntentId)
      );
      verifyPaymentIdentity(checkout, payment);
      const result = await store.activatePurchase({
        ...checkout,
        paymentState: payment.state
      }, {
        eventCreated: normalized.eventCreated,
        eventId: normalized.eventId,
        eventType: normalized.eventType
      });
      recordEvent("lifetime_webhook", {
        eventType: normalized.eventType,
        outcome: result.outcome
      });
      return result;
    }
  };
}

/**
 * @param {Record<string, unknown>} checkout
 * @param {{ ownerId: string, purchaseId: string }} payment
 */
function verifyPaymentIdentity(checkout, payment) {
  if (
    payment.ownerId !== checkout.ownerId ||
    payment.purchaseId !== checkout.purchaseId
  ) {
    throw new LifetimeVerificationError(
      "Checkout and PaymentIntent identities do not match."
    );
  }
}

import { describe, expect, it, vi } from "vitest";
import { createClassExpeditionBilling } from "../server/class-expedition-billing.js";

const APP_ORIGIN = "https://echo-maze.test";
const BASE_PRICE = "price_test_expedition_base";
const EXTENSION_PRICE = "price_test_expedition_extension";

/** @param {Record<string, unknown>} [overrides] */
function stripeSession(overrides = {}) {
  const metadata = {
    purchase_kind: "class_expedition_license",
    purchase_id: "9d2f8a34-0000-4000-8000-000000000001",
    expedition_id: "exped_billing_1",
    license_kind: "base",
    sponsor_user_id: "user_sponsor_1"
  };
  return {
    id: "cs_test_expedition_1",
    amount_total: 4900,
    currency: "usd",
    livemode: false,
    mode: "payment",
    metadata,
    payment_intent: { id: "pi_expedition_1", metadata },
    payment_status: "paid",
    status: "open",
    url: "https://checkout.stripe.com/c/pay/cs_test_expedition_1",
    line_items: {
      data: [{ price: { id: BASE_PRICE }, quantity: 1 }]
    },
    ...overrides
  };
}

function fakeStore() {
  return {
    reserveLicense: vi.fn(async () => true),
    activateLicense: vi.fn(async () => true),
    transitionLicense: vi.fn(async () => true)
  };
}

/** @param {Record<string, unknown>} [sessionOverrides] */
function fakeStripe(sessionOverrides = {}) {
  const session = stripeSession(sessionOverrides);
  return {
    session,
    checkout: {
      sessions: {
        create: vi.fn(async () => session),
        retrieve: vi.fn(async () => session)
      }
    },
    paymentIntents: {
      retrieve: vi.fn(async () => ({
        id: "pi_expedition_1",
        livemode: false,
        metadata: session.metadata
      }))
    }
  };
}

/**
 * @param {ReturnType<typeof fakeStripe>} stripe
 * @param {ReturnType<typeof fakeStore>} store
 */
function billing(stripe, store) {
  return createClassExpeditionBilling({
    appOrigin: APP_ORIGIN,
    basePriceId: BASE_PRICE,
    extensionPriceId: EXTENSION_PRICE,
    stripe,
    store,
    createId: () => "9d2f8a34-0000-4000-8000-000000000001"
  });
}

describe("Class Expedition billing", () => {
  it("creates a test-mode License checkout with idempotent purchase identity", async () => {
    const stripe = fakeStripe();
    const store = fakeStore();
    const result = await billing(stripe, store).createLicenseCheckout({
      userId: "user_sponsor_1",
      classroomId: "org_class_1",
      expeditionId: "exped_billing_1",
      kind: "base"
    });

    expect(store.reserveLicense).toHaveBeenCalledWith("user_sponsor_1", {
      purchaseId: "9d2f8a34-0000-4000-8000-000000000001",
      expeditionId: "exped_billing_1",
      kind: "base",
      priceId: BASE_PRICE
    });
    const [payload, options] = /** @type {any[]} */ (
      stripe.checkout.sessions.create.mock.calls[0]
    );
    expect(payload.mode).toBe("payment");
    expect(payload.allow_promotion_codes).toBe(false);
    expect(payload.line_items).toEqual([{ price: BASE_PRICE, quantity: 1 }]);
    expect(payload.metadata).toMatchObject({
      purchase_kind: "class_expedition_license",
      purchase_id: "9d2f8a34-0000-4000-8000-000000000001",
      expedition_id: "exped_billing_1",
      license_kind: "base",
      sponsor_user_id: "user_sponsor_1"
    });
    expect(payload.payment_intent_data.metadata).toEqual(payload.metadata);
    expect(payload.success_url.startsWith(`${APP_ORIGIN}/class`)).toBe(true);
    expect(payload.cancel_url.startsWith(`${APP_ORIGIN}/class`)).toBe(true);
    expect(options.idempotencyKey).toBe(
      "echo-maze-expedition:9d2f8a34-0000-4000-8000-000000000001"
    );
    expect(result).toEqual({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_expedition_1",
      purchaseId: "9d2f8a34-0000-4000-8000-000000000001"
    });
  });

  it("uses the extension price for a five-seat extension", async () => {
    const stripe = fakeStripe({
      metadata: {
        purchase_kind: "class_expedition_license",
        purchase_id: "9d2f8a34-0000-4000-8000-000000000001",
        expedition_id: "exped_billing_1",
        license_kind: "extension",
        sponsor_user_id: "user_sponsor_1"
      },
      line_items: { data: [{ price: { id: EXTENSION_PRICE }, quantity: 1 }] }
    });
    const store = fakeStore();
    await billing(stripe, store).createLicenseCheckout({
      userId: "user_sponsor_1",
      classroomId: "org_class_1",
      expeditionId: "exped_billing_1",
      kind: "extension"
    });
    const [payload] = /** @type {any[]} */ (
      stripe.checkout.sessions.create.mock.calls[0]
    );
    expect(payload.line_items).toEqual([
      { price: EXTENSION_PRICE, quantity: 1 }
    ]);
  });

  it("refuses a live-mode, closed, or off-host created checkout", async () => {
    for (const overrides of [
      { livemode: true },
      { status: "complete" },
      { url: "https://evil.example/checkout" },
      { amount_total: 0 }
    ]) {
      const stripe = fakeStripe(overrides);
      const store = fakeStore();
      await expect(
        billing(stripe, store).createLicenseCheckout({
          userId: "user_sponsor_1",
          classroomId: "org_class_1",
          expeditionId: "exped_billing_1",
          kind: "base"
        })
      ).rejects.toThrow();
    }
  });

  it("owns only events that carry the Expedition purchase kind", async () => {
    const stripe = fakeStripe();
    const store = fakeStore();
    const owner = billing(stripe, store);

    await expect(
      owner.ownsEvent({
        id: "evt_1",
        type: "checkout.session.completed",
        created: 100,
        data: { object: stripeSession() }
      })
    ).resolves.toBe(true);
    await expect(
      owner.ownsEvent({
        id: "evt_2",
        type: "checkout.session.completed",
        created: 100,
        data: {
          object: stripeSession({
            metadata: { purchase_id: "lifetime-purchase" }
          })
        }
      })
    ).resolves.toBe(false);
    await expect(
      owner.ownsEvent({
        id: "evt_3",
        type: "refund.created",
        created: 100,
        data: {
          object: { payment_intent: "pi_expedition_1", status: "succeeded" }
        }
      })
    ).resolves.toBe(true);
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      "pi_expedition_1"
    );
  });

  it("activates the License from a paid test-mode checkout event", async () => {
    const stripe = fakeStripe({ status: "complete" });
    const store = fakeStore();
    const result = await billing(stripe, store).processVerifiedEvent({
      id: "evt_paid_1",
      type: "checkout.session.completed",
      created: 1234,
      data: { object: stripeSession() }
    });
    expect(store.activateLicense).toHaveBeenCalledWith({
      purchaseId: "9d2f8a34-0000-4000-8000-000000000001",
      checkoutSessionId: "cs_test_expedition_1",
      paymentIntentId: "pi_expedition_1",
      amount: 4900,
      currency: "usd",
      eventCreated: 1234
    });
    expect(result).toMatchObject({ outcome: "activated" });
  });

  it("never activates from a live-mode or unpaid session", async () => {
    for (const overrides of [
      { livemode: true },
      { payment_status: "unpaid" },
      { amount_total: 0 },
      { currency: "eur" }
    ]) {
      const stripe = fakeStripe(overrides);
      const store = fakeStore();
      await expect(
        billing(stripe, store).processVerifiedEvent({
          id: "evt_bad_1",
          type: "checkout.session.completed",
          created: 1234,
          data: { object: stripeSession(overrides) }
        })
      ).rejects.toThrow();
      expect(store.activateLicense).not.toHaveBeenCalled();
    }
  });

  it("records expiry, refund, and dispute transitions idempotently", async () => {
    const stripe = fakeStripe();
    const store = fakeStore();
    const owner = billing(stripe, store);

    await owner.processVerifiedEvent({
      id: "evt_exp_1",
      type: "checkout.session.expired",
      created: 2000,
      data: { object: stripeSession() }
    });
    expect(store.transitionLicense).toHaveBeenLastCalledWith(
      "9d2f8a34-0000-4000-8000-000000000001",
      "expired",
      2000
    );

    await owner.processVerifiedEvent({
      id: "evt_ref_1",
      type: "refund.created",
      created: 3000,
      data: {
        object: { payment_intent: "pi_expedition_1", status: "succeeded" }
      }
    });
    expect(store.transitionLicense).toHaveBeenLastCalledWith(
      "9d2f8a34-0000-4000-8000-000000000001",
      "refunded",
      3000
    );

    await owner.processVerifiedEvent({
      id: "evt_disp_1",
      type: "charge.dispute.created",
      created: 4000,
      data: { object: { payment_intent: "pi_expedition_1" } }
    });
    expect(store.transitionLicense).toHaveBeenLastCalledWith(
      "9d2f8a34-0000-4000-8000-000000000001",
      "disputed",
      4000
    );

    await owner.processVerifiedEvent({
      id: "evt_disp_2",
      type: "charge.dispute.closed",
      created: 5000,
      data: { object: { payment_intent: "pi_expedition_1", status: "won" } }
    });
    expect(store.transitionLicense).toHaveBeenLastCalledWith(
      "9d2f8a34-0000-4000-8000-000000000001",
      "paid",
      5000
    );
  });

  it("ignores unrelated or malformed events without store writes", async () => {
    const stripe = fakeStripe();
    const store = fakeStore();
    const result = await billing(stripe, store).processVerifiedEvent({
      id: "evt_noise_1",
      type: "payment_intent.created",
      created: 6000,
      data: { object: { id: "pi_expedition_1" } }
    });
    expect(result).toEqual({ outcome: "ignored" });
    expect(store.activateLicense).not.toHaveBeenCalled();
    expect(store.transitionLicense).not.toHaveBeenCalled();
  });
});

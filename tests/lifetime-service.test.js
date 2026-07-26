import {
  LifetimeOwnershipError,
  createLifetimeService
} from "../server/lifetime-service.js";
import { LifetimeVerificationError } from "../server/lifetime-domain.js";
import { describe, expect, it, vi } from "vitest";

const CONFIG = { priceId: "price_echo_test" };
const USER_ID = "user_explorer";
const PURCHASE_ID = "purchase_123";
const SESSION_ID = "cs_test_echo";

function paidCheckout(overrides = {}) {
  return {
    amountTotal: 599,
    currency: "usd",
    livemode: false,
    mode: "payment",
    ownerId: USER_ID,
    paymentIntentId: "pi_echo",
    paymentStatus: "paid",
    priceId: CONFIG.priceId,
    purchaseId: PURCHASE_ID,
    quantity: 1,
    sessionStatus: "complete",
    sessionId: SESSION_ID,
    ...overrides
  };
}

function dependencies(overrides = {}) {
  const store = {
    abandonCheckout: vi.fn().mockResolvedValue(true),
    activatePurchase: vi.fn().mockImplementation(async (_checkout, event) =>
      event
        ? { outcome: "processed" }
        : {
            canStartRun: true,
            lifetime: true,
            state: "lifetime_active"
          }
    ),
    attachCheckout: vi.fn().mockResolvedValue(undefined),
    closeCheckout: vi.fn().mockResolvedValue({ outcome: "processed" }),
    findPurchaseBySession: vi.fn().mockResolvedValue({
      playerId: USER_ID,
      priceId: CONFIG.priceId,
      purchaseId: PURCHASE_ID,
      sessionId: SESSION_ID,
      status: "open"
    }),
    reservePurchase: vi.fn().mockResolvedValue({
      purchaseId: PURCHASE_ID,
      sessionId: null,
      state: "reserved"
    }),
    transitionEntitlement: vi.fn().mockResolvedValue({
      outcome: "processed"
    })
  };
  const provider = {
    constructWebhookEvent: vi.fn(),
    createCheckout: vi.fn().mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_echo",
      sessionId: SESSION_ID
    }),
    retrieveCheckout: vi.fn().mockResolvedValue(paidCheckout()),
    retrieveCheckoutLink: vi.fn().mockResolvedValue(
      "https://checkout.stripe.com/c/pay/cs_test_echo"
    ),
    retrievePaymentReference: vi.fn().mockResolvedValue({
      ownerId: USER_ID,
      purchaseId: PURCHASE_ID,
      state: "paid"
    })
  };
  return {
    config: CONFIG,
    createId: () => PURCHASE_ID,
    provider,
    recordEvent: vi.fn(),
    store,
    ...overrides
  };
}

describe("Lifetime Membership service", () => {
  it("reserves and attaches one server-owned Checkout", async () => {
    const deps = dependencies();
    const service = createLifetimeService(deps);

    await expect(service.createCheckout(USER_ID)).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_echo",
      purchaseId: PURCHASE_ID,
      state: "checkout_open"
    });
    expect(deps.store.reservePurchase).toHaveBeenCalledWith(
      USER_ID,
      PURCHASE_ID,
      CONFIG.priceId
    );
    expect(deps.provider.createCheckout).toHaveBeenCalledWith({
      purchaseId: PURCHASE_ID,
      userId: USER_ID
    });
    expect(deps.store.attachCheckout).toHaveBeenCalledWith(
      PURCHASE_ID,
      SESSION_ID
    );
  });

  it("reuses an open Checkout and never creates a duplicate", async () => {
    const deps = dependencies();
    deps.store.reservePurchase.mockResolvedValue({
      purchaseId: PURCHASE_ID,
      sessionId: SESSION_ID,
      state: "open"
    });
    const service = createLifetimeService(deps);

    await service.createCheckout(USER_ID);

    expect(deps.provider.retrieveCheckoutLink).toHaveBeenCalledWith(SESSION_ID);
    expect(deps.provider.createCheckout).not.toHaveBeenCalled();
  });

  it("replaces a closed unpaid Checkout instead of dead-ending retries", async () => {
    const deps = dependencies({
      createId: vi.fn()
        .mockReturnValueOnce(PURCHASE_ID)
        .mockReturnValueOnce("purchase_456")
    });
    deps.store.reservePurchase
      .mockResolvedValueOnce({
        purchaseId: PURCHASE_ID,
        sessionId: SESSION_ID,
        state: "open"
      })
      .mockResolvedValueOnce({
        purchaseId: "purchase_456",
        sessionId: null,
        state: "reserved"
      });
    deps.provider.retrieveCheckoutLink.mockRejectedValue(
      new LifetimeVerificationError("Checkout closed.")
    );
    deps.provider.retrieveCheckout.mockResolvedValue(
      paidCheckout({
        paymentStatus: "unpaid",
        sessionStatus: "expired"
      })
    );
    deps.provider.createCheckout.mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_new",
      sessionId: "cs_test_new"
    });
    const service = createLifetimeService(deps);

    await expect(service.createCheckout(USER_ID)).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_new",
      purchaseId: "purchase_456",
      state: "checkout_open"
    });
    expect(deps.store.abandonCheckout).toHaveBeenCalledWith(
      PURCHASE_ID,
      SESSION_ID
    );
    expect(deps.store.attachCheckout).toHaveBeenCalledWith(
      "purchase_456",
      "cs_test_new"
    );
  });

  it("does not replace a completed Checkout while async payment is pending", async () => {
    const deps = dependencies();
    deps.store.reservePurchase.mockResolvedValue({
      purchaseId: PURCHASE_ID,
      sessionId: SESSION_ID,
      state: "open"
    });
    deps.provider.retrieveCheckoutLink.mockRejectedValue(
      new LifetimeVerificationError("Checkout closed.")
    );
    deps.provider.retrieveCheckout.mockResolvedValue(
      paidCheckout({
        paymentStatus: "unpaid",
        sessionStatus: "complete"
      })
    );
    const service = createLifetimeService(deps);

    await expect(
      service.createCheckout(USER_ID)
    ).rejects.toThrow("Checkout closed.");
    expect(deps.store.abandonCheckout).not.toHaveBeenCalled();
    expect(deps.provider.createCheckout).not.toHaveBeenCalled();
  });

  it("returns active membership without contacting Stripe", async () => {
    const deps = dependencies();
    deps.store.reservePurchase.mockResolvedValue({
      purchaseId: PURCHASE_ID,
      sessionId: null,
      state: "member"
    });
    const service = createLifetimeService(deps);

    await expect(service.createCheckout(USER_ID)).resolves.toEqual({
      checkoutUrl: null,
      purchaseId: PURCHASE_ID,
      state: "lifetime_active"
    });
    expect(deps.provider.createCheckout).not.toHaveBeenCalled();
  });

  it("direct confirmation verifies ownership and activates through the shared operation", async () => {
    const deps = dependencies();
    const service = createLifetimeService(deps);

    await expect(
      service.confirmCheckout(USER_ID, SESSION_ID)
    ).resolves.toMatchObject({
      lifetime: true,
      state: "lifetime_active"
    });
    expect(deps.store.activatePurchase).toHaveBeenCalledWith(
      paidCheckout(),
      null
    );
    expect(deps.provider.retrievePaymentReference).toHaveBeenCalledWith(
      "pi_echo"
    );
  });

  it("rejects direct confirmation after Stripe reports a full refund", async () => {
    const deps = dependencies();
    deps.provider.retrievePaymentReference.mockResolvedValue({
      ownerId: USER_ID,
      purchaseId: PURCHASE_ID,
      state: "refunded"
    });
    const service = createLifetimeService(deps);

    await expect(
      service.confirmCheckout(USER_ID, SESSION_ID)
    ).rejects.toBeInstanceOf(LifetimeVerificationError);
    expect(deps.store.activatePurchase).not.toHaveBeenCalled();
  });

  it("records the store outcome when direct activation cannot link", async () => {
    const deps = dependencies();
    deps.store.activatePurchase.mockResolvedValue({ outcome: "unlinked" });
    const service = createLifetimeService(deps);

    await expect(
      service.confirmCheckout(USER_ID, SESSION_ID)
    ).resolves.toEqual({ outcome: "unlinked" });
    expect(deps.recordEvent).toHaveBeenCalledWith(
      "lifetime_confirmation",
      { outcome: "unlinked" }
    );
  });

  it("rejects a cross-account confirmation before activation", async () => {
    const deps = dependencies();
    deps.store.findPurchaseBySession.mockResolvedValue({
      playerId: "user_someone_else",
      priceId: CONFIG.priceId,
      purchaseId: PURCHASE_ID,
      sessionId: SESSION_ID,
      status: "open"
    });
    const service = createLifetimeService(deps);

    await expect(
      service.confirmCheckout(USER_ID, SESSION_ID)
    ).rejects.toBeInstanceOf(LifetimeOwnershipError);
    expect(deps.store.activatePurchase).not.toHaveBeenCalled();
  });

  it("uses the same activation operation for a signed paid webhook", async () => {
    const deps = dependencies();
    deps.provider.constructWebhookEvent.mockReturnValue({
      id: "evt_paid",
      type: "checkout.session.completed",
      created: 100,
      data: { object: { id: SESSION_ID } }
    });
    const service = createLifetimeService(deps);

    await expect(
      service.processWebhook(Buffer.from("{}"), "t=1,v1=signed")
    ).resolves.toEqual({ outcome: "processed" });
    expect(deps.store.activatePurchase).toHaveBeenCalledWith(
      { ...paidCheckout(), paymentState: "paid" },
      {
        eventCreated: 100,
        eventId: "evt_paid",
        eventType: "checkout.session.completed"
      }
    );
    expect(deps.store.findPurchaseBySession).not.toHaveBeenCalled();
  });

  it("rejects a paid webhook when Session and PaymentIntent owners diverge", async () => {
    const deps = dependencies();
    deps.provider.constructWebhookEvent.mockReturnValue({
      id: "evt_paid_conflict",
      type: "checkout.session.completed",
      created: 100,
      data: { object: { id: SESSION_ID } }
    });
    deps.provider.retrievePaymentReference.mockResolvedValue({
      ownerId: "user_other",
      purchaseId: PURCHASE_ID,
      state: "paid"
    });
    const service = createLifetimeService(deps);

    await expect(
      service.processWebhook(Buffer.from("{}"), "t=1,v1=signed")
    ).rejects.toBeInstanceOf(LifetimeVerificationError);
    expect(deps.store.activatePurchase).not.toHaveBeenCalled();
  });

  it("returns and records the store outcome for a stale paid webhook", async () => {
    const deps = dependencies();
    deps.provider.constructWebhookEvent.mockReturnValue({
      id: "evt_paid_stale",
      type: "checkout.session.completed",
      created: 90,
      data: { object: { id: SESSION_ID } }
    });
    deps.store.activatePurchase.mockResolvedValue({ outcome: "stale" });
    const service = createLifetimeService(deps);

    await expect(
      service.processWebhook(Buffer.from("{}"), "t=1,v1=signed")
    ).resolves.toEqual({ outcome: "stale" });
    expect(deps.recordEvent).toHaveBeenCalledWith("lifetime_webhook", {
      eventType: "checkout.session.completed",
      outcome: "stale"
    });
  });

  it("routes refunds and disputes through the entitlement transition", async () => {
    const deps = dependencies();
    deps.provider.constructWebhookEvent.mockReturnValue({
      id: "evt_dispute",
      type: "charge.dispute.created",
      created: 101,
      data: { object: { payment_intent: "pi_echo" } }
    });
    const service = createLifetimeService(deps);

    await service.processWebhook(Buffer.from("{}"), "t=1,v1=signed");

    expect(deps.store.transitionEntitlement).toHaveBeenCalledWith({
      eventCreated: 101,
      eventId: "evt_dispute",
      eventType: "charge.dispute.created",
      ownerId: USER_ID,
      paymentIntentId: "pi_echo",
      purchaseId: PURCHASE_ID,
      state: "disputed"
    });
    expect(deps.recordEvent).toHaveBeenCalledWith("lifetime_webhook", {
      eventType: "charge.dispute.created",
      outcome: "processed"
    });
  });

  it("records a bounded outcome when Checkout closes", async () => {
    const deps = dependencies();
    deps.provider.constructWebhookEvent.mockReturnValue({
      id: "evt_expired",
      type: "checkout.session.expired",
      created: 102,
      data: { object: { id: SESSION_ID } }
    });
    const service = createLifetimeService(deps);

    await expect(
      service.processWebhook(Buffer.from("{}"), "t=1,v1=signed")
    ).resolves.toEqual({ outcome: "processed" });
    expect(deps.recordEvent).toHaveBeenCalledWith("lifetime_webhook", {
      eventType: "checkout.session.expired",
      outcome: "processed"
    });
  });

  it("records an ignored outcome without copying an unknown provider type", async () => {
    const deps = dependencies();
    deps.provider.constructWebhookEvent.mockReturnValue({
      id: "evt_unknown",
      type: "customer.secret_payload",
      created: 103,
      data: { object: { raw: "must-not-leak" } }
    });
    const service = createLifetimeService(deps);

    await expect(
      service.processWebhook(Buffer.from("{}"), "t=1,v1=signed")
    ).resolves.toEqual({ outcome: "ignored" });
    expect(deps.recordEvent).toHaveBeenCalledWith("lifetime_webhook", {
      outcome: "ignored"
    });
  });

  it("uses cumulative Stripe state before revoking split refunds", async () => {
    const deps = dependencies();
    deps.provider.constructWebhookEvent.mockReturnValue({
      id: "evt_partial",
      type: "refund.updated",
      created: 102,
      data: {
        object: {
          amount: 300,
          payment_intent: "pi_echo",
          status: "succeeded"
        }
      }
    });
    deps.provider.retrievePaymentReference.mockResolvedValue({
      ownerId: USER_ID,
      purchaseId: PURCHASE_ID,
      state: "paid"
    });
    deps.store.transitionEntitlement.mockResolvedValue({
      outcome: "ignored"
    });
    const service = createLifetimeService(deps);

    await expect(
      service.processWebhook(Buffer.from("{}"), "t=1,v1=signed")
    ).resolves.toEqual({ outcome: "ignored" });
    expect(deps.store.transitionEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ state: null })
    );

    deps.provider.constructWebhookEvent.mockReturnValue({
      id: "evt_split_complete",
      type: "refund.updated",
      created: 103,
      data: {
        object: {
          amount: 299,
          payment_intent: "pi_echo",
          status: "succeeded"
        }
      }
    });
    deps.provider.retrievePaymentReference.mockResolvedValue({
      ownerId: USER_ID,
      purchaseId: PURCHASE_ID,
      state: "refunded"
    });
    deps.store.transitionEntitlement.mockResolvedValue({
      outcome: "processed"
    });

    await service.processWebhook(Buffer.from("{}"), "t=1,v1=signed");
    expect(deps.store.transitionEntitlement).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "refunded" })
    );
  });
});

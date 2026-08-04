import {
  createStripeLifetimeProvider,
  normalizeStripeCheckoutSession
} from "../server/stripe-lifetime.js";
import { loadLifetimeConfig } from "../server/lifetime-config.js";
import { describe, expect, it, vi } from "vitest";

function stripeSession(overrides = {}) {
  return {
    amount_total: 599,
    currency: "usd",
    id: "cs_test_echo",
    line_items: {
      data: [{ price: { id: "price_echo_test" }, quantity: 1 }]
    },
    livemode: false,
    metadata: {
      clerk_user_id: "user_explorer",
      purchase_id: "purchase_123"
    },
    mode: "payment",
    payment_intent: "pi_echo",
    payment_status: "paid",
    status: "complete",
    url: "https://checkout.stripe.com/c/pay/cs_test_echo",
    ...overrides
  };
}

describe("Stripe lifetime adapter", () => {
  it("issues one full refund per purchase with a stable idempotency key", async () => {
    const createRefund = vi.fn().mockResolvedValue({
      id: "re_echo",
      status: "pending"
    });
    const provider = createStripeLifetimeProvider({
      appOrigin: "https://maze.example",
      priceId: "price_echo_test",
      getStripe: async () => ({
        checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
        paymentIntents: { retrieve: vi.fn() },
        refunds: { create: createRefund },
        webhooks: { constructEvent: vi.fn() }
      }),
      webhookSecret: "whsec_test"
    });

    await expect(
      provider.issueRefund({
        paymentIntentId: "pi_echo",
        purchaseId: "purchase_123"
      })
    ).resolves.toEqual({ refundId: "re_echo", status: "pending" });
    expect(createRefund).toHaveBeenCalledWith(
      { payment_intent: "pi_echo" },
      { idempotencyKey: "echo-maze-refund:purchase_123" }
    );
  });

  it("creates only the fixed one-time Checkout contract with an idempotency key", async () => {
    const create = vi.fn().mockResolvedValue(
      stripeSession({
        payment_intent: null,
        payment_status: "unpaid",
        status: "open"
      })
    );
    const provider = createStripeLifetimeProvider({
      appOrigin: "https://maze.example",
      priceId: "price_echo_test",
      getStripe: async () => ({
        checkout: { sessions: { create, retrieve: vi.fn() } },
        paymentIntents: { retrieve: vi.fn() },
        webhooks: { constructEvent: vi.fn() }
      }),
      webhookSecret: "whsec_test"
    });

    await expect(
      provider.createCheckout({
        purchaseId: "purchase_123",
        userId: "user_explorer"
      })
    ).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_echo",
      sessionId: "cs_test_echo"
    });
    expect(create).toHaveBeenCalledWith(
      {
        allow_promotion_codes: false,
        cancel_url: "https://maze.example/play?checkout=canceled",
        client_reference_id: "purchase_123",
        expand: ["line_items.data.price", "payment_intent"],
        line_items: [{ price: "price_echo_test", quantity: 1 }],
        metadata: {
          clerk_user_id: "user_explorer",
          purchase_id: "purchase_123"
        },
        mode: "payment",
        payment_intent_data: {
          metadata: {
            clerk_user_id: "user_explorer",
            purchase_id: "purchase_123"
          }
        },
        success_url:
          "https://maze.example/play?checkout=success&session_id={CHECKOUT_SESSION_ID}"
      },
      { idempotencyKey: "echo-maze-lifetime:purchase_123" }
    );
  });

  it("retrieves expanded Checkout facts and never returns the raw object", async () => {
    const retrieve = vi.fn().mockResolvedValue(stripeSession());
    const retrievePaymentIntent = vi.fn().mockResolvedValue({
      amount_received: 599,
      currency: "usd",
      latest_charge: {
        amount_refunded: 0,
        disputed: false,
        refunded: false
      },
      livemode: false,
      metadata: {
        clerk_user_id: "user_explorer",
        purchase_id: "purchase_123"
      },
      status: "succeeded"
    });
    const provider = createStripeLifetimeProvider({
      appOrigin: "http://localhost:3000",
      priceId: "price_echo_test",
      getStripe: async () => ({
        checkout: { sessions: { create: vi.fn(), retrieve } },
        paymentIntents: { retrieve: retrievePaymentIntent },
        webhooks: { constructEvent: vi.fn() }
      }),
      webhookSecret: "whsec_test"
    });

    await expect(provider.retrieveCheckout("cs_test_echo")).resolves.toEqual({
      amountTotal: 599,
      currency: "usd",
      livemode: false,
      mode: "payment",
      ownerId: "user_explorer",
      paymentIntentId: "pi_echo",
      paymentStatus: "paid",
      priceId: "price_echo_test",
      purchaseId: "purchase_123",
      quantity: 1,
      sessionStatus: "complete",
      sessionId: "cs_test_echo"
    });
    expect(retrieve).toHaveBeenCalledWith("cs_test_echo", {
      expand: ["line_items.data.price", "payment_intent"]
    });
    await expect(
      provider.retrievePaymentReference("pi_echo")
    ).resolves.toEqual({
      ownerId: "user_explorer",
      purchaseId: "purchase_123",
      state: "paid"
    });
    expect(retrievePaymentIntent).toHaveBeenCalledWith("pi_echo", {
      expand: ["latest_charge"]
    });
  });

  it("reports a fully refunded PaymentIntent as ineligible for confirmation", async () => {
    const provider = createStripeLifetimeProvider({
      appOrigin: "http://localhost:3000",
      priceId: "price_echo_test",
      getStripe: async () => ({
        checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
        paymentIntents: {
          retrieve: vi.fn().mockResolvedValue({
            amount_received: 599,
            currency: "usd",
            latest_charge: {
              amount_refunded: 599,
              disputed: false,
              refunded: true
            },
            livemode: false,
            metadata: {
              clerk_user_id: "user_explorer",
              purchase_id: "purchase_123"
            },
            status: "succeeded"
          })
        },
        webhooks: { constructEvent: vi.fn() }
      }),
      webhookSecret: "whsec_test"
    });

    await expect(provider.retrievePaymentReference("pi_echo")).resolves.toEqual({
      ownerId: "user_explorer",
      purchaseId: "purchase_123",
      state: "refunded"
    });
  });

  it("passes the untouched body and signature to Stripe verification", async () => {
    const constructEvent = vi.fn().mockReturnValue({ id: "evt_verified" });
    const provider = createStripeLifetimeProvider({
      appOrigin: "https://maze.example",
      priceId: "price_echo_test",
      getStripe: async () => ({
        checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
        paymentIntents: { retrieve: vi.fn() },
        webhooks: { constructEvent }
      }),
      webhookSecret: "whsec_test"
    });
    const rawBody = Buffer.from('{"id":"evt_verified"}');

    // Async now: the SDK is imported on first use rather than at module
    // load, so verification has to await the client.
    await expect(
      provider.constructWebhookEvent(rawBody, "t=1,v1=signed")
    ).resolves.toEqual({ id: "evt_verified" });
    expect(constructEvent).toHaveBeenCalledWith(
      rawBody,
      "t=1,v1=signed",
      "whsec_test"
    );
  });

  it("normalizes expanded object identities", () => {
    expect(
      normalizeStripeCheckoutSession(
        stripeSession({
          payment_intent: { id: "pi_expanded" }
        })
      ).paymentIntentId
    ).toBe("pi_expanded");
  });
});

describe("lifetime configuration", () => {
  const configured = {
    ECHO_MAZE_APP_ORIGIN: "https://maze.example",
    STRIPE_PRICE_ID: "price_echo_test",
    STRIPE_SECRET_KEY: "sk_test_safe-placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_safe-placeholder"
  };

  it("accepts a complete test-mode configuration", () => {
    expect(loadLifetimeConfig(configured)).toEqual({
      appOrigin: "https://maze.example",
      priceId: "price_echo_test",
      secretKey: "sk_test_safe-placeholder",
      webhookSecret: "whsec_safe-placeholder",
      expedition: null
    });
  });

  it("loads Class Expedition test prices only when both are present", () => {
    expect(
      loadLifetimeConfig({
        ...configured,
        STRIPE_EXPEDITION_PRICE_ID: "price_expedition_base",
        STRIPE_EXPEDITION_EXTENSION_PRICE_ID: "price_expedition_extension"
      })?.expedition
    ).toEqual({
      basePriceId: "price_expedition_base",
      extensionPriceId: "price_expedition_extension"
    });
    expect(
      loadLifetimeConfig({
        ...configured,
        STRIPE_EXPEDITION_PRICE_ID: "price_expedition_base"
      })?.expedition
    ).toBeNull();
    expect(
      loadLifetimeConfig({
        ...configured,
        STRIPE_EXPEDITION_PRICE_ID: "expedition_base",
        STRIPE_EXPEDITION_EXTENSION_PRICE_ID: "price_expedition_extension"
      })?.expedition
    ).toBeNull();
  });

  it.each([
    ["missing values", {}],
    [
      "a live secret",
      { ...configured, STRIPE_SECRET_KEY: "sk_live_never_allowed" }
    ],
    [
      "a non-TLS remote origin",
      { ...configured, ECHO_MAZE_APP_ORIGIN: "http://maze.example" }
    ]
  ])("rejects %s", (_label, env) => {
    expect(loadLifetimeConfig(env)).toBeNull();
  });
});

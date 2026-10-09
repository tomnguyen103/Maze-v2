import {
  LifetimeVerificationError,
  normalizeLifetimeProviderEvent,
  verifyLifetimeCheckout
} from "../server/lifetime-domain.js";
import { describe, expect, it } from "vitest";

const EXPECTED = {
  mode: /** @type {const} */ ("test"),
  priceId: "price_echo_maze_test",
  purchaseId: "94c80187-3b30-4f61-a7b7-b07ce9e4ba9e",
  userId: "user_explorer"
};

/** @type {Array<[string, Record<string, unknown>]>} */
const MISMATCHES = [
  ["amount", { amountTotal: 600 }],
  ["currency", { currency: "cad" }],
  ["mode", { mode: "subscription" }],
  ["owner", { ownerId: "user_someone_else" }],
  ["paid status", { paymentStatus: "unpaid" }],
  ["Price", { priceId: "price_wrong" }],
  ["purchase", { purchaseId: "purchase_wrong" }],
  ["quantity", { quantity: 2 }]
];

function paidCheckout(overrides = {}) {
  return {
    amountTotal: 599,
    currency: "usd",
    livemode: false,
    mode: "payment",
    ownerId: EXPECTED.userId,
    paymentIntentId: "pi_echo_maze_test",
    paymentStatus: "paid",
    priceId: EXPECTED.priceId,
    purchaseId: EXPECTED.purchaseId,
    quantity: 1,
    sessionStatus: "complete",
    sessionId: "cs_test_echo_maze",
    ...overrides
  };
}

describe("lifetime Checkout verification", () => {
  it("US-03.1 accepts a paid live-mode Checkout when the mode is live", () => {
    const checkout = paidCheckout({ livemode: true });
    expect(
      verifyLifetimeCheckout(checkout, { ...EXPECTED, mode: "live" })
    ).toEqual(checkout);
  });

  it("US-03.2 accepts a paid test-mode Checkout when the mode is test", () => {
    expect(verifyLifetimeCheckout(paidCheckout(), EXPECTED)).toEqual(
      paidCheckout()
    );
  });

  it.each(
    /** @type {Array<["test" | "live", boolean]>} */ ([
      ["test", true],
      ["live", false]
    ])
  )("US-03.2 rejects a Checkout whose livemode disagrees with mode %s", (mode, livemode) => {
    expect(() =>
      verifyLifetimeCheckout(paidCheckout({ livemode }), { ...EXPECTED, mode })
    ).toThrow(/^mode_mismatch$/);
  });

  it.each(
    /** @type {Array<[string, "test" | "live", Record<string, unknown>]>} */ (
      /** @type {const} */ (["test", "live"]).flatMap((mode) =>
        MISMATCHES.map(([label, override]) => [label, mode, override])
      )
    )
  )("US-03.3 rejects a mismatched %s in %s mode", (_label, mode, override) => {
    expect(() =>
      verifyLifetimeCheckout(
        paidCheckout({ livemode: mode === "live", ...override }),
        { ...EXPECTED, mode }
      )
    ).toThrow(LifetimeVerificationError);
  });

  it("US-03.3 requires opaque Stripe Session and PaymentIntent identities", () => {
    expect(() =>
      verifyLifetimeCheckout(
        paidCheckout({ paymentIntentId: "", sessionId: "" }),
        EXPECTED
      )
    ).toThrow(LifetimeVerificationError);
  });
});

describe("lifetime provider event normalization", () => {
  it.each([
    [
      "checkout.session.completed",
      { id: "cs_test_paid" },
      { kind: "checkout-paid", sessionId: "cs_test_paid" }
    ],
    [
      "checkout.session.async_payment_succeeded",
      { id: "cs_test_delayed" },
      { kind: "checkout-paid", sessionId: "cs_test_delayed" }
    ],
    [
      "checkout.session.expired",
      { id: "cs_test_expired" },
      { kind: "checkout-closed", sessionId: "cs_test_expired" }
    ],
    [
      "checkout.session.async_payment_failed",
      { id: "cs_test_failed" },
      { kind: "checkout-closed", sessionId: "cs_test_failed" }
    ],
    [
      "refund.created",
      { amount: 599, payment_intent: "pi_refunded", status: "succeeded" },
      {
        kind: "refund",
        paymentIntentId: "pi_refunded"
      }
    ],
    [
      "refund.updated",
      { amount: 599, payment_intent: "pi_refunded", status: "succeeded" },
      {
        kind: "refund",
        paymentIntentId: "pi_refunded"
      }
    ],
    [
      "charge.dispute.created",
      { payment_intent: "pi_disputed" },
      {
        kind: "entitlement",
        paymentIntentId: "pi_disputed",
        state: "disputed"
      }
    ],
    [
      "charge.dispute.closed",
      { payment_intent: "pi_won", status: "won" },
      {
        kind: "entitlement",
        paymentIntentId: "pi_won",
        state: "active"
      }
    ],
    [
      "charge.dispute.closed",
      { payment_intent: "pi_warning", status: "warning_closed" },
      {
        kind: "entitlement",
        paymentIntentId: "pi_warning",
        state: "active"
      }
    ],
    [
      "charge.dispute.funds_reinstated",
      { payment_intent: "pi_restored" },
      {
        kind: "entitlement",
        paymentIntentId: "pi_restored",
        state: "active"
      }
    ]
  ])("normalizes %s", (type, object, normalized) => {
    expect(
      normalizeLifetimeProviderEvent({
        id: `evt_${type}`,
        type,
        created: 42,
        data: { object }
      })
    ).toEqual({
      eventCreated: 42,
      eventId: `evt_${type}`,
      eventType: type,
      ...normalized
    });
  });

  it("normalizes partial refunds for cumulative provider verification", () => {
    expect(normalizeLifetimeProviderEvent({
      id: "evt_partial",
      type: "refund.created",
      created: 1,
      data: {
        object: {
          amount: 100,
          payment_intent: "pi_partial",
          status: "succeeded"
        }
      }
    })).toMatchObject({
      kind: "refund",
      paymentIntentId: "pi_partial"
    });
  });

  it("ignores incomplete refunds, lost disputes, and unknown events", () => {
    const events = [
      {
        id: "evt_failed",
        type: "refund.created",
        created: 2,
        data: {
          object: {
            amount: 599,
            payment_intent: "pi_failed",
            status: "failed"
          }
        }
      },
      {
        id: "evt_pending",
        type: "refund.created",
        created: 2,
        data: {
          object: {
            amount: 599,
            payment_intent: "pi_pending",
            status: "pending"
          }
        }
      },
      {
        id: "evt_canceled",
        type: "refund.updated",
        created: 2,
        data: {
          object: {
            amount: 599,
            payment_intent: "pi_canceled",
            status: "canceled"
          }
        }
      },
      {
        id: "evt_lost",
        type: "charge.dispute.closed",
        created: 3,
        data: {
          object: { payment_intent: "pi_lost", status: "lost" }
        }
      },
      {
        id: "evt_customer",
        type: "customer.updated",
        created: 4,
        data: { object: { id: "cus_nope" } }
      }
    ];

    for (const event of events) {
      expect(normalizeLifetimeProviderEvent(event)).toBeNull();
    }
  });
});

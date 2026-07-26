import {
  createLifetimeStore
} from "../server/lifetime-store.js";
import { describe, expect, it, vi } from "vitest";

/** @param {Record<string, unknown>[][]} results */
function transactionalPool(results) {
  const query = vi.fn();
  for (const result of results) {
    query.mockResolvedValueOnce({ rows: result });
  }
  const client = { query, release: vi.fn() };
  return {
    client,
    pool: {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn()
    }
  };
}

describe("Lifetime Membership store", () => {
  it("reserves one pending purchase under the player row lock", async () => {
    const { client, pool } = transactionalPool([
      [],
      [],
      [],
      [{ active_purchase_id: null, membership_state: "none" }],
      [{
        checkout_session_id: null,
        id: "purchase_123",
        status: "pending"
      }],
      []
    ]);
    const store = createLifetimeStore(pool);

    await expect(
      store.reservePurchase("user_explorer", "purchase_123", "price_test")
    ).resolves.toEqual({
      purchaseId: "purchase_123",
      sessionId: null,
      state: "reserved"
    });
    expect(client.query.mock.calls[2][0]).toContain(
      "FROM lifetime_purchases"
    );
    expect(client.query.mock.calls[3][0]).toContain("FOR UPDATE");
    expect(client.query.mock.calls[4][0]).toContain(
      "INSERT INTO lifetime_purchases"
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns an active member without creating another purchase", async () => {
    const { client, pool } = transactionalPool([
      [],
      [],
      [],
      [{
        active_purchase_id: "purchase_paid",
        membership_state: "active"
      }],
      []
    ]);
    const store = createLifetimeStore(pool);

    await expect(
      store.reservePurchase("user_explorer", "purchase_new", "price_test")
    ).resolves.toEqual({
      purchaseId: "purchase_paid",
      sessionId: null,
      state: "member"
    });
    expect(
      client.query.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO lifetime_purchases")
      )
    ).toBe(false);
  });

  it("maps a purchase by its opaque Checkout Session", async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({
        rows: [{
          checkout_session_id: "cs_test_echo",
          id: "purchase_123",
          player_id: "user_explorer",
          status: "open",
          stripe_price_id: "price_test"
        }]
      })
    };
    const store = createLifetimeStore(pool);

    await expect(
      store.findPurchaseBySession("cs_test_echo")
    ).resolves.toEqual({
      playerId: "user_explorer",
      priceId: "price_test",
      purchaseId: "purchase_123",
      sessionId: "cs_test_echo",
      status: "open"
    });
  });

  it("does not downgrade a paid purchase when Checkout attachment finishes late", async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({
        rows: [{ id: "purchase_123" }]
      })
    };
    const store = createLifetimeStore(pool);

    await store.attachCheckout("purchase_123", "cs_test_echo");

    const sql = String(pool.query.mock.calls[0][0]).replace(/\s+/g, " ");
    expect(sql).toContain(
      "CASE WHEN status IN ('pending', 'open') THEN 'open' ELSE status END"
    );
    expect(sql).not.toContain("status = 'open'");
  });

  it("releases a closed unpaid Checkout reservation for a fresh purchase", async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({
        rows: [{ id: "purchase_123" }]
      })
    };
    const store = createLifetimeStore(pool);

    await expect(
      store.abandonCheckout("purchase_123", "cs_test_closed")
    ).resolves.toBe(true);
    const sql = String(pool.query.mock.calls[0][0]).replace(/\s+/g, " ");
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("checkout_session_id = $2");
    expect(sql).toContain("status IN ('pending', 'open')");
  });

  it("activates direct confirmation without a webhook watermark", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{
        id: "purchase_123",
        player_id: "user_explorer",
        provider_event_created: 0,
        status: "open"
      }],
      [{
        lifetime_state_event_created: 0,
        membership_state: "none"
      }],
      [],
      [],
      []
    ]);
    const store = createLifetimeStore(pool);

    await expect(
      store.activatePurchase({
        ownerId: "user_explorer",
        paymentIntentId: "pi_echo",
        priceId: "price_test",
        purchaseId: "purchase_123",
        sessionId: "cs_test_echo"
      }, null)
    ).resolves.toEqual({
      canStartRun: true,
      lifetime: true,
      state: "lifetime_active"
    });
    expect(client.query.mock.calls[4][0]).toContain(
      "membership_state = 'active'"
    );
  });

  it("links a paid webhook by verified purchase metadata before Session attachment", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_paid_early" }],
      [{
        id: "purchase_123",
        player_id: "user_explorer",
        provider_event_created: 0,
        status: "pending",
        stripe_price_id: "price_test"
      }],
      [{
        lifetime_state_event_created: 0,
        membership_state: "none"
      }],
      [],
      [],
      [],
      []
    ]);
    const store = createLifetimeStore(pool);

    await expect(
      store.activatePurchase(
        {
          ownerId: "user_explorer",
          paymentIntentId: "pi_echo",
          paymentState: "paid",
          priceId: "price_test",
          purchaseId: "purchase_123",
          sessionId: "cs_test_echo"
        },
        {
          eventCreated: 100,
          eventId: "evt_paid_early",
          eventType: "checkout.session.completed"
        }
      )
    ).resolves.toEqual({ outcome: "processed" });
    const selectionSql = String(client.query.mock.calls[2][0]).replace(
      /\s+/g,
      " "
    );
    expect(selectionSql).toContain(
      "WHERE id = $2"
    );
    expect(selectionSql).toContain(
      "checkout_session_id IS NULL OR checkout_session_id = $1"
    );
    expect(selectionSql).toContain(
      "payment_intent_id IS NULL OR payment_intent_id = $5"
    );
    expect(client.query.mock.calls[4][0]).toContain(
      "checkout_session_id = COALESCE"
    );
  });

  it("deduplicates a replayed paid webhook before entitlement writes", async () => {
    const { client, pool } = transactionalPool([
      [],
      [],
      []
    ]);
    const store = createLifetimeStore(pool);

    await expect(
      store.activatePurchase(
        {
          paymentIntentId: "pi_echo",
          paymentState: "paid",
          ownerId: "user_explorer",
          priceId: "price_test",
          purchaseId: "purchase_123",
          sessionId: "cs_test_echo"
        },
        {
          eventCreated: 100,
          eventId: "evt_paid",
          eventType: "checkout.session.completed"
        }
      )
    ).resolves.toEqual({ outcome: "duplicate" });
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it("records but does not activate a Checkout whose payment is now refunded", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_paid_after_refund" }],
      [],
      []
    ]);
    const store = createLifetimeStore(pool);

    await expect(
      store.activatePurchase(
        {
          ownerId: "user_explorer",
          paymentIntentId: "pi_echo",
          paymentState: "refunded",
          priceId: "price_test",
          purchaseId: "purchase_123",
          sessionId: "cs_test_echo"
        },
        {
          eventCreated: 102,
          eventId: "evt_paid_after_refund",
          eventType: "checkout.session.completed"
        }
      )
    ).resolves.toEqual({ outcome: "ignored" });
    expect(
      client.query.mock.calls.some(([sql]) =>
        String(sql).includes("FROM lifetime_purchases")
      )
    ).toBe(false);
  });

  it("records a partial refund without changing entitlement", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_partial" }],
      [],
      []
    ]);
    const store = createLifetimeStore(pool);

    await expect(store.transitionEntitlement({
      eventCreated: 102,
      eventId: "evt_partial",
      eventType: "refund.updated",
      ownerId: "user_explorer",
      paymentIntentId: "pi_echo",
      purchaseId: "purchase_123",
      state: null
    })).resolves.toEqual({ outcome: "ignored" });
    expect(
      client.query.mock.calls.some(([sql]) =>
        String(sql).includes("FROM lifetime_purchases")
      )
    ).toBe(false);
  });

  it("links an early dispute by purchase metadata and blocks future Runs", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_dispute" }],
      [{
        id: "purchase_123",
        player_id: "user_explorer",
        provider_event_created: 0,
        status: "open"
      }],
      [{
        lifetime_state_event_created: 0,
        membership_state: "none"
      }],
      [],
      [],
      [],
      []
    ]);
    const store = createLifetimeStore(pool);

    await expect(
      store.transitionEntitlement({
        eventCreated: 101,
        eventId: "evt_dispute",
        eventType: "charge.dispute.created",
        ownerId: "user_explorer",
        paymentIntentId: "pi_echo",
        purchaseId: "purchase_123",
        state: "disputed"
      })
    ).resolves.toEqual({
      outcome: "processed",
      state: "lifetime_disputed"
    });
    const selectionSql = String(client.query.mock.calls[2][0]).replace(
      /\s+/g,
      " "
    );
    expect(selectionSql).toContain("WHERE id = $2");
    expect(selectionSql).toContain(
      "payment_intent_id IS NULL OR payment_intent_id = $1"
    );
    expect(client.query.mock.calls[5][0]).toContain(
      "membership_state = $1"
    );
  });
});

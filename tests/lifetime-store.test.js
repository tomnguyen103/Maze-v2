import {
  createLifetimeStore
} from "../server/lifetime-store.js";
import { createRunAccessStore } from "../server/run-access-store.js";
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

/** @param {Record<string, unknown>[][]} results @param {{ failFact?: boolean }} [options] */
function paidPool(results, { failFact = false } = {}) {
  const queue = [...results];
  const query = vi.fn(/** @type {(sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} */ (async (sql) => {
    if (failFact && String(sql).includes("INSERT INTO financial_facts")) {
      throw new Error("financial fact insert failed");
    }
    return { rows: queue.shift() ?? [] };
  }));
  const client = { query, release: vi.fn() };
  return {
    client,
    pool: { connect: vi.fn().mockResolvedValue(client), query: vi.fn() }
  };
}

/** BEGIN, webhook claim, linked purchase, empty projection, then the writes. */
const LINKED_PAID = [
  [],
  [{ event_id: "evt_paid" }],
  [{
    id: "purchase_123",
    player_id: "user_explorer",
    provider_event_created: 0,
    status: "pending"
  }],
  [{ lifetime_state_event_created: 0, membership_state: "none" }],
  [],
  [],
  [],
  [],
  []
];

const PAID_EVENT = {
  eventCreated: 100,
  eventId: "evt_paid",
  eventType: "checkout.session.completed"
};

const REFUND_EVENT = {
  eventCreated: 200,
  eventId: "evt_refund",
  eventType: "charge.refunded",
  ownerId: "user_deleted",
  paymentIntentId: "pi_live_echo",
  purchaseId: "purchase_123"
};

/** @param {string} paymentIntentId */
function paidCheckout(paymentIntentId) {
  return {
    ownerId: "user_explorer",
    paymentIntentId,
    paymentState: "paid",
    priceId: "price_live",
    purchaseId: "purchase_123",
    sessionId: "cs_live_echo"
  };
}

/** @param {{ query: { mock: { calls: unknown[][] } } }} client */
function factWrites(client) {
  return client.query.mock.calls.filter(([sql]) =>
    String(sql).includes("INSERT INTO financial_facts")
  );
}

describe("Lifetime Financial Facts", () => {
  it("US-01.1 writes one paid live fact inside the purchase transaction", async () => {
    const { client, pool } = paidPool(LINKED_PAID);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(
      store.activatePurchase(paidCheckout("pi_live_echo"), PAID_EVENT)
    ).resolves.toEqual({ outcome: "processed" });

    const writes = factWrites(client);
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toEqual([
      "pi_live_echo",
      "live",
      599,
      "usd",
      "paid",
      0,
      100
    ]);
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.findIndex((sql) => sql.includes("INSERT INTO financial_facts"))).toBeLessThan(
      statements.indexOf("COMMIT")
    );
  });

  it("US-01.2 stores the test Billing Mode on a test-mode fact", async () => {
    const { client, pool } = paidPool(LINKED_PAID);
    const store = createLifetimeStore(pool, { mode: "test" });

    await store.activatePurchase(paidCheckout("pi_test_echo"), PAID_EVENT);

    expect(factWrites(client)[0][1]).toEqual([
      "pi_test_echo",
      "test",
      599,
      "usd",
      "paid",
      0,
      100
    ]);
  });

  it("US-02.2 records the charge's refunded cents on a paid fact", async () => {
    const { client, pool } = paidPool(LINKED_PAID);
    const store = createLifetimeStore(pool, { mode: "live" });

    await store.activatePurchase({ ...paidCheckout("pi_live_echo"), refundedCents: 300 }, PAID_EVENT);

    expect(factWrites(client)[0][1]).toEqual(["pi_live_echo", "live", 599, "usd", "paid", 300, 100]);
  });

  it("US-01.2 writes no fact for an Unclassified Purchase", async () => {
    const { client, pool } = paidPool([[], [{ event_id: "evt_paid" }], []]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(
      store.activatePurchase(paidCheckout("pi_live_echo"), PAID_EVENT)
    ).resolves.toEqual({ outcome: "unlinked" });
    expect(factWrites(client)).toHaveLength(0);
  });

  it("US-01.3 writes no fact when the purchase fails the link checks", async () => {
    const { client, pool } = paidPool([[], [{ event_id: "evt_paid" }], []]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await store.activatePurchase(paidCheckout("pi_other_echo"), PAID_EVENT);

    expect(factWrites(client)).toHaveLength(0);
    const link = client.query.mock.calls.find(([sql]) => String(sql).includes("FROM lifetime_purchases"));
    const linkSql = String(link?.[0]).replace(/\s+/g, " ");
    for (const check of [
      "id = $2",
      "player_id = $3",
      "stripe_price_id = $4",
      "checkout_session_id = $1",
      "payment_intent_id = $5",
      "billing_mode = $6"
    ]) {
      expect(linkSql).toContain(check);
    }
    expect(link?.[1]).toEqual(["cs_live_echo", "purchase_123", "user_explorer", "price_live", "pi_other_echo", "live"]);
  });

  it("US-01.1 writes the paid fact when an older access clock makes the paid event stale", async () => {
    const { client, pool } = paidPool([
      [],
      [{ event_id: "evt_paid" }],
      [{ id: "purchase_123", player_id: "user_explorer", provider_event_created: 400, status: "paid" }],
      [{ lifetime_state_event_created: 650, membership_mode: "live", membership_state: "active" }]
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(
      store.activatePurchase(paidCheckout("pi_live_echo"), PAID_EVENT)
    ).resolves.toEqual({ outcome: "stale" });

    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("UPDATE player_access"))).toBe(false);
    expect(factWrites(client)[0][1]).toEqual(["pi_live_echo", "live", 599, "usd", "paid", 0, 400]);
  });

  it("US-02.5 starts a late first fact at the purchase clock", async () => {
    const { client, pool } = paidPool([
      [],
      [{ event_id: "evt_paid" }],
      [{ id: "purchase_123", player_id: "user_explorer", provider_event_created: 300, status: "disputed" }]
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await store.activatePurchase({ ...paidCheckout("pi_live_echo"), paymentState: "disputed" }, PAID_EVENT);

    expect(factWrites(client)[0][1]).toEqual(["pi_live_echo", "live", 599, "usd", "disputed", 0, 300]);
  });

  it("US-02.5 records a disputed fact for a paid event that arrives after a dispute", async () => {
    const { client, pool } = paidPool([
      [],
      [{ event_id: "evt_paid" }],
      [{ id: "purchase_123", player_id: "user_explorer", provider_event_created: 0, status: "pending" }]
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(
      store.activatePurchase({ ...paidCheckout("pi_live_echo"), paymentState: "disputed" }, PAID_EVENT)
    ).resolves.toEqual({ outcome: "ignored" });

    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("player_access"))).toBe(false);
    expect(factWrites(client)[0][1]).toEqual(["pi_live_echo", "live", 599, "usd", "disputed", 0, 100]);
  });

  it("US-01.5 rolls the purchase back when the fact write fails", async () => {
    const { client, pool } = paidPool(LINKED_PAID, { failFact: true });
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(
      store.activatePurchase(paidCheckout("pi_live_echo"), PAID_EVENT)
    ).rejects.toThrow("financial fact insert failed");
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });

  it("US-03.1 refunds the fact of a deleted account and keeps the event unlinked", async () => {
    const { client, pool } = paidPool([
      [],
      [{ event_id: "evt_refund" }],
      [],
      [{ provider_event_created: 100, refunded_cents: 0, status: "paid" }]
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(store.transitionEntitlement({
      ...REFUND_EVENT,
      refundedCents: 599,
      state: "refunded"
    })).resolves.toEqual({ outcome: "unlinked" });

    const calls = client.query.mock.calls;
    const update = calls.find(([sql]) => sql.includes("UPDATE financial_facts"));
    expect(update?.[1]).toEqual(["pi_live_echo", "refunded", 599, 200]);
    const finish = calls.find(([sql]) => sql.includes("UPDATE stripe_webhook_events"));
    expect(finish?.[1]).toContain("unlinked");
    expect(calls.map(([sql]) => sql)).toContain("COMMIT");
  });

  it("US-03.3 recreates no account row for a deleted account", async () => {
    const { client, pool } = paidPool([
      [],
      [{ event_id: "evt_refund" }],
      [],
      [{ provider_event_created: 100, refunded_cents: 0, status: "paid" }]
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await store.transitionEntitlement({ ...REFUND_EVENT, refundedCents: 599, state: "refunded" });

    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    for (const table of ["player_access", "players", "lifetime_purchases"]) {
      expect(statements.some((sql) =>
        new RegExp(`(INSERT INTO|UPDATE) ${table}\\b`).test(sql)
      )).toBe(false);
    }
  });

  it("US-02.2 raises refunded cents for a partial refund with no state change", async () => {
    const { client, pool } = paidPool([
      [],
      [{ event_id: "evt_refund" }],
      [{ provider_event_created: 100, refunded_cents: 0, status: "paid" }]
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(store.transitionEntitlement({
      ...REFUND_EVENT,
      refundedCents: 300,
      state: null
    })).resolves.toEqual({ outcome: "ignored" });

    const update = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE financial_facts")
    );
    expect(update?.[1]).toEqual(["pi_live_echo", "paid", 300, 100]);
  });

  it("US-03.2 returns a deleted account's disputed fact to paid when the dispute is won", async () => {
    const { client, pool } = paidPool([
      [],
      [{ event_id: "evt_refund" }],
      [],
      [{ provider_event_created: 150, refunded_cents: 0, status: "disputed" }]
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(store.transitionEntitlement({
      ...REFUND_EVENT,
      eventType: "charge.dispute.closed",
      state: "active"
    })).resolves.toEqual({ outcome: "unlinked" });

    const update = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE financial_facts")
    );
    expect(update?.[1]).toEqual(["pi_live_echo", "paid", 0, 200]);
  });

  it("US-03.4 applies a repeated event to the fact only once", async () => {
    const { client, pool } = paidPool([[], []]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(store.transitionEntitlement({
      ...REFUND_EVENT,
      refundedCents: 599,
      state: "refunded"
    })).resolves.toEqual({ outcome: "duplicate" });
    expect(client.query.mock.calls.some(([sql]) =>
      String(sql).includes("financial_facts")
    )).toBe(false);
  });

  it("US-03.5 records an unlinked event with no fact and creates none", async () => {
    const { client, pool } = paidPool([[], [{ event_id: "evt_refund" }], [], []]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(store.transitionEntitlement({
      ...REFUND_EVENT,
      refundedCents: 599,
      state: "refunded"
    })).resolves.toEqual({ outcome: "unlinked" });
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("INSERT INTO financial_facts"))).toBe(false);
    expect(statements.some((sql) => sql.includes("UPDATE financial_facts"))).toBe(false);
  });

  it("US-04.4 locks the fact after the purchase and access rows", async () => {
    const { client, pool } = paidPool([
      [],
      [{ event_id: "evt_refund" }],
      [{ id: "purchase_123", player_id: "user_explorer", provider_event_created: 100, status: "paid" }],
      [{ lifetime_state_event_created: 100, membership_mode: "live", membership_state: "active" }],
      [],
      [],
      [{ provider_event_created: 100, refunded_cents: 0, status: "paid" }]
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(store.transitionEntitlement({
      ...REFUND_EVENT,
      refundedCents: 599,
      state: "refunded"
    })).resolves.toMatchObject({ outcome: "processed" });

    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    const at = (/** @type {string} */ text) => statements.findIndex((sql) => sql.includes(text));
    expect(at("FROM lifetime_purchases")).toBeLessThan(at("FROM player_access"));
    expect(at("FROM player_access")).toBeLessThan(at("FROM financial_facts"));
    expect(at("UPDATE player_access")).toBeLessThan(at("UPDATE financial_facts"));
    const update = client.query.mock.calls.find(([sql]) => String(sql).includes("UPDATE financial_facts"));
    expect(update?.[1]).toEqual(["pi_live_echo", "refunded", 599, 200]);
    expect(statements).toContain("COMMIT");
  });
});

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
    const store = createLifetimeStore(pool, { mode: "test" });

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
    expect(client.query.mock.calls[1][0]).toContain(
      "pg_advisory_xact_lock"
    );
    expect(client.query.mock.calls[1][0]).toContain(
      "deleted_user_tombstones"
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
        membership_mode: "test",
        membership_state: "active"
      }],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "test" });

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
    const store = createLifetimeStore(pool, { mode: "test" });

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
    const store = createLifetimeStore(pool, { mode: "test" });

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
    const store = createLifetimeStore(pool, { mode: "test" });

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
    const store = createLifetimeStore(pool, { mode: "test" });

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
    const store = createLifetimeStore(pool, { mode: "test" });

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
    const store = createLifetimeStore(pool, { mode: "test" });

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

  it("US-01.3 records the fact but does not activate a Checkout whose payment is now refunded", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_paid_after_refund" }],
      [{ id: "purchase_123", player_id: "user_explorer", provider_event_created: 0, status: "pending" }],
      [],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "test" });

    await expect(
      store.activatePurchase(
        {
          ownerId: "user_explorer",
          paymentIntentId: "pi_echo",
          paymentState: "refunded",
          priceId: "price_test",
          purchaseId: "purchase_123",
          refundedCents: 599,
          sessionId: "cs_test_echo"
        },
        {
          eventCreated: 102,
          eventId: "evt_paid_after_refund",
          eventType: "checkout.session.completed"
        }
      )
    ).resolves.toEqual({ outcome: "ignored" });
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("player_access"))).toBe(false);
    expect(statements.some((sql) => sql.includes("UPDATE lifetime_purchases"))).toBe(false);
    const fact = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO financial_facts")
    );
    expect(fact?.[1]).toEqual(["pi_echo", "test", 599, "usd", "refunded", 599, 102]);
  });

  it("records a partial refund without changing entitlement", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_partial" }],
      [],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "test" });

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

  /**
   * BEGIN, webhook claim, a purchase, then a projection in the same state at
   * 300; later queries default to no rows.
   * @param {string} eventId
   * @param {"disputed" | "refunded"} state
   */
  function clockedPool(eventId, state = "disputed") {
    return paidPool([
      [],
      [{ event_id: eventId }],
      [{
        id: "purchase_123",
        player_id: "user_explorer",
        provider_event_created: 300,
        status: state
      }],
      [{
        lifetime_state_event_created: 300,
        membership_mode: "test",
        membership_state: state
      }]
    ]);
  }

  /** @param {{ query: { mock: { calls: unknown[][] } } }} client @param {string} table */
  function updateValues(client, table) {
    const call = client.query.mock.calls.find(([sql]) =>
      String(sql).includes(`UPDATE ${table}`)
    );
    return /** @type {unknown[] | undefined} */ (call?.[1]);
  }

  it("US-01.1 refunds access for a full refund that arrives after a newer dispute", async () => {
    const { client, pool } = clockedPool("evt_late_refund");
    const store = createLifetimeStore(pool, { mode: "test" });

    await expect(store.transitionEntitlement({
      eventCreated: 250,
      eventId: "evt_late_refund",
      eventType: "charge.refunded",
      ownerId: "user_explorer",
      paymentIntentId: "pi_echo",
      purchaseId: "purchase_123",
      refundedCents: 599,
      state: "refunded"
    })).resolves.toEqual({ outcome: "processed", state: "lifetime_refunded" });
    expect(updateValues(client, "lifetime_purchases")?.slice(2)).toEqual(["refunded", 300]);
    expect(updateValues(client, "player_access")?.slice(0, 3)).toEqual(["refunded", "purchase_123", 300]);
  });

  it("US-01.2 keeps a fully refunded charge refunded when a dispute is won", async () => {
    const { client, pool } = clockedPool("evt_dispute_won");
    const store = createLifetimeStore(pool, { mode: "test" });

    await expect(store.transitionEntitlement({
      eventCreated: 400,
      eventId: "evt_dispute_won",
      eventType: "charge.dispute.closed",
      ownerId: "user_explorer",
      paymentIntentId: "pi_echo",
      purchaseId: "purchase_123",
      refundedCents: 599,
      state: "active"
    })).resolves.toEqual({ outcome: "processed", state: "lifetime_refunded" });
    expect(updateValues(client, "lifetime_purchases")?.slice(2)).toEqual(["refunded", 400]);
    expect(updateValues(client, "player_access")?.slice(0, 3)).toEqual(["refunded", "purchase_123", 400]);
  });

  it("US-01.1 keeps the clock order for a refund one cent short of the Lifetime amount", async () => {
    const { client, pool } = clockedPool("evt_short_refund");
    const store = createLifetimeStore(pool, { mode: "test" });

    await expect(store.transitionEntitlement({
      eventCreated: 250,
      eventId: "evt_short_refund",
      eventType: "charge.refunded",
      ownerId: "user_explorer",
      paymentIntentId: "pi_echo",
      purchaseId: "purchase_123",
      refundedCents: 598,
      state: "refunded"
    })).resolves.toEqual({ outcome: "stale", state: "lifetime_disputed" });
    expect(updateValues(client, "player_access")).toBeUndefined();
  });

  it("US-01.4 leaves refunded access unchanged when a dispute on the refunded charge is won", async () => {
    const { client, pool } = clockedPool("evt_dispute_won", "refunded");
    const store = createLifetimeStore(pool, { mode: "test" });

    await expect(store.transitionEntitlement({
      eventCreated: 400,
      eventId: "evt_dispute_won",
      eventType: "charge.dispute.closed",
      ownerId: "user_explorer",
      paymentIntentId: "pi_echo",
      purchaseId: "purchase_123",
      refundedCents: 599,
      state: "active"
    })).resolves.toEqual({ outcome: "ignored", state: "lifetime_refunded" });
    expect(updateValues(client, "lifetime_purchases")).toBeUndefined();
    expect(updateValues(client, "player_access")).toBeUndefined();
  });

  it("refunds access when a late Checkout event sees a fully refunded charge", async () => {
    const { client, pool } = clockedPool("evt_late_checkout");
    const store = createLifetimeStore(pool, { mode: "test" });

    await expect(store.activatePurchase({
      ownerId: "user_explorer",
      paymentIntentId: "pi_echo",
      paymentState: "refunded",
      priceId: "price_test",
      purchaseId: "purchase_123",
      refundedCents: 599,
      sessionId: "cs_test_echo"
    }, {
      eventCreated: 250,
      eventId: "evt_late_checkout",
      eventType: "checkout.session.completed"
    })).resolves.toEqual({ outcome: "processed", state: "lifetime_refunded" });
    expect(updateValues(client, "lifetime_purchases")?.slice(2)).toEqual(["refunded", 300]);
    expect(updateValues(client, "player_access")?.slice(0, 3)).toEqual(["refunded", "purchase_123", 300]);
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
    const store = createLifetimeStore(pool, { mode: "test" });

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

  it("US-06.2 grants no membership from a test-mode projection under live", async () => {
    const { client, pool } = transactionalPool([
      [],
      [],
      [],
      [{
        active_purchase_id: "purchase_paid",
        membership_mode: "test",
        membership_state: "active"
      }],
      [{
        checkout_session_id: null,
        id: "purchase_new",
        status: "pending"
      }],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(
      store.reservePurchase("user_explorer", "purchase_new", "price_live")
    ).resolves.toEqual({
      purchaseId: "purchase_new",
      sessionId: null,
      state: "reserved"
    });
    expect(client.query.mock.calls[4][0]).toContain(
      "INSERT INTO lifetime_purchases"
    );
  });

  it("US-06.1 grants membership from a live projection under live", async () => {
    const { pool } = transactionalPool([
      [],
      [],
      [],
      [{
        active_purchase_id: "purchase_paid",
        membership_mode: "live",
        membership_state: "active"
      }],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(
      store.reservePurchase("user_explorer", "purchase_new", "price_live")
    ).resolves.toEqual({
      purchaseId: "purchase_paid",
      sessionId: null,
      state: "member"
    });
  });

  it("US-05.1 writes the configured mode on a new purchase", async () => {
    const { client, pool } = transactionalPool([
      [],
      [],
      [],
      [{
        active_purchase_id: null,
        membership_mode: null,
        membership_state: "none"
      }],
      [{
        checkout_session_id: null,
        id: "purchase_new",
        status: "pending"
      }],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await store.reservePurchase("user_explorer", "purchase_new", "price_live");
    expect(client.query.mock.calls[4][0]).toContain("billing_mode");
    expect(client.query.mock.calls[4][1]).toEqual([
      "purchase_new",
      "user_explorer",
      "price_live",
      "live"
    ]);
  });

  it("US-07.2 reuses only a pending purchase of the configured mode", async () => {
    const { client, pool } = transactionalPool([
      [],
      [],
      [],
      [{
        active_purchase_id: null,
        membership_mode: null,
        membership_state: "none"
      }],
      [{
        checkout_session_id: null,
        id: "purchase_new",
        status: "pending"
      }],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await store.reservePurchase("user_explorer", "purchase_new", "price_live");
    expect(client.query.mock.calls[2][0]).toContain("billing_mode = $2");
    expect(client.query.mock.calls[2][1]).toEqual([
      "user_explorer",
      "live"
    ]);
  });

  it("US-05.2 records the configured mode on each webhook event", async () => {
    const { client, pool } = transactionalPool([[], []]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(
      store.activatePurchase({
        ownerId: "user_explorer",
        paymentIntentId: "pi_live",
        paymentState: "paid",
        priceId: "price_live",
        purchaseId: "purchase_123",
        sessionId: "cs_live_echo"
      }, {
        eventCreated: 100,
        eventId: "evt_live",
        eventType: "checkout.session.completed"
      })
    ).resolves.toEqual({ outcome: "duplicate" });
    expect(client.query.mock.calls[1][0]).toContain("billing_mode");
    expect(client.query.mock.calls[1][1]).toContain("live");
  });

  it("US-06.4 writes the live mode onto the projection on activation", async () => {
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
        membership_mode: "test",
        membership_state: "active"
      }],
      [],
      [],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await store.activatePurchase({
      ownerId: "user_explorer",
      paymentIntentId: "pi_live",
      priceId: "price_live",
      purchaseId: "purchase_123",
      sessionId: "cs_live_echo"
    }, null);
    const projectionSql = client.query.mock.calls[4][0];
    expect(projectionSql).toContain("membership_mode = $4");
    expect(projectionSql).toContain("$4::text = 'live'");
    expect(client.query.mock.calls[4][1]).toEqual([
      "user_explorer",
      "purchase_123",
      0,
      "live"
    ]);
  });

  it.each([
    ["a test-mode projection", "test", "active"],
    ["an unclassified projection", null, "refunded"]
  ])(
    "US-06.4 a live activation replaces %s once and resets the event clock",
    async (_label, projectionMode, projectionState) => {
      const { client, pool } = transactionalPool([
        [],
        [{ event_id: "evt_live" }],
        [{ id: "purchase_123", player_id: "user_explorer", provider_event_created: 0 }],
        [{
          lifetime_state_event_created: 900,
          membership_mode: projectionMode,
          membership_state: projectionState
        }],
        [],
        [],
        [],
        []
      ]);
      const store = createLifetimeStore(pool, { mode: "live" });

      await expect(store.activatePurchase({
        ownerId: "user_explorer",
        paymentIntentId: "pi_live",
        paymentState: "paid",
        priceId: "price_live",
        purchaseId: "purchase_123",
        sessionId: "cs_live_echo"
      }, {
        eventCreated: 100,
        eventId: "evt_live",
        eventType: "checkout.session.completed"
      })).resolves.toEqual({ outcome: "processed" });
      const [projectionSql, projectionValues] = client.query.mock.calls[5];
      expect(projectionSql).toContain("UPDATE player_access");
      expect(projectionSql).toMatch(/WHEN membership_mode = \$4::text THEN GREATEST/);
      expect(projectionSql).toMatch(/ELSE \$3\s+END/);
      expect(projectionValues).toEqual(["user_explorer", "purchase_123", 100, "live"]);
    }
  );

  it("US-06.3 a test activation reads a live projection as no membership and cannot overwrite it", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_test" }],
      [{ id: "purchase_123", player_id: "user_explorer", provider_event_created: 0 }],
      [{
        lifetime_state_event_created: 900,
        membership_mode: "live",
        membership_state: "active"
      }],
      [],
      [],
      [],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "test" });

    await expect(store.activatePurchase({
      ownerId: "user_explorer",
      paymentIntentId: "pi_test",
      paymentState: "paid",
      priceId: "price_test",
      purchaseId: "purchase_123",
      sessionId: "cs_test_echo"
    }, {
      eventCreated: 100,
      eventId: "evt_test",
      eventType: "checkout.session.completed"
    })).resolves.toEqual({ outcome: "processed" });
    const [projectionSql, projectionValues] = client.query.mock.calls[5];
    expect(projectionSql).toMatch(
      /membership_mode IS NULL OR\s+membership_mode = \$4::text OR\s+\$4::text = 'live'/
    );
    expect(projectionValues[3]).toBe("test");
  });

  it("US-06.4 a live refund guards the projection write with the same mode rule", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_refund" }],
      [{ id: "purchase_123", player_id: "user_explorer", provider_event_created: 0 }],
      [{
        lifetime_state_event_created: 100,
        membership_mode: "live",
        membership_state: "active"
      }],
      [],
      [],
      [],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(store.transitionEntitlement({
      eventCreated: 200,
      eventId: "evt_refund",
      eventType: "charge.refunded",
      ownerId: "user_explorer",
      paymentIntentId: "pi_live",
      purchaseId: "purchase_123",
      state: "refunded"
    })).resolves.toMatchObject({ outcome: "processed" });
    const [projectionSql, projectionValues] = client.query.mock.calls[5];
    expect(projectionSql).toMatch(
      /membership_mode IS NULL OR\s+membership_mode = \$5::text OR\s+\$5::text = 'live'/
    );
    expect(projectionValues).toEqual(["refunded", "purchase_123", 200, "user_explorer", "live"]);
  });

  it("US-06.3 orders a late test event by the purchase, not by a live projection", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_late" }],
      [{ id: "purchase_123", player_id: "user_explorer", status: "refunded", provider_event_created: 200 }],
      [{
        lifetime_state_event_created: 900,
        membership_mode: "live",
        membership_state: "active"
      }],
      [],
      [],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "test" });

    const result = await store.transitionEntitlement({
      eventCreated: 100,
      eventId: "evt_late",
      eventType: "checkout.session.completed",
      ownerId: "user_explorer",
      paymentIntentId: "pi_test",
      purchaseId: "purchase_123",
      state: "active"
    });

    expect(result.outcome).not.toBe("processed");
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("UPDATE lifetime_purchases"))).toBe(false);
    expect(statements.some((sql) => sql.includes("UPDATE player_access"))).toBe(false);
  });

  it("US-06.3 a late test checkout event keeps a refunded test purchase refunded under a live projection", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_late_checkout" }],
      [{ id: "purchase_123", player_id: "user_explorer", status: "refunded", provider_event_created: 200 }],
      [{
        lifetime_state_event_created: 900,
        membership_mode: "live",
        membership_state: "active"
      }],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "test" });

    const result = await store.activatePurchase({
      ownerId: "user_explorer",
      paymentIntentId: "pi_test",
      paymentState: "paid",
      priceId: "price_test",
      purchaseId: "purchase_123",
      sessionId: "cs_test_echo"
    }, {
      eventCreated: 100,
      eventId: "evt_late_checkout",
      eventType: "checkout.session.completed"
    });

    expect(result.outcome).not.toBe("processed");
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("UPDATE lifetime_purchases"))).toBe(false);
    expect(statements.some((sql) => sql.includes("UPDATE player_access"))).toBe(false);
  });

  it("US-07.3 ignores a refund of the other mode without touching the purchase", async () => {
    const { client, pool } = transactionalPool([
      [],
      [{ event_id: "evt_refund_test" }],
      [],
      []
    ]);
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(store.transitionEntitlement({
      eventCreated: 103,
      eventId: "evt_refund_test",
      eventType: "charge.refunded",
      ownerId: "user_explorer",
      paymentIntentId: "pi_test",
      purchaseId: "purchase_123",
      state: "refunded"
    })).resolves.toEqual({ outcome: "unlinked" });
    expect(client.query.mock.calls[2][0]).toContain("billing_mode");
    expect(client.query.mock.calls[2][1]).toContain("live");
  });

  it("US-06.5 admits a live member from the stored projection with no Stripe call", async () => {
    const { client, pool } = transactionalPool([
      [],
      [],
      [{ free_runs_used: 0, membership_state: "active" }],
      [],
      [],
      []
    ]);
    const store = createRunAccessStore(pool, { mode: "live" });

    await expect(
      store.authorizeRun("user_explorer", {
        runId: "access_live_member",
        seed: "MOSS-WATCH-11",
        levelId: "trail-scout",
        labyrinthNumber: 4
      })
    ).resolves.toMatchObject({ allowed: true, state: "member" });
    expect(client.query.mock.calls[2][0]).toContain(
      "CASE WHEN membership_mode = 'live'"
    );
  });

  it("US-09.2 counts purchases with no Billing Mode in one query", async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({ rows: [{ count: "3" }] })
    };
    const store = createLifetimeStore(pool, { mode: "live" });

    await expect(store.countUnclassifiedPurchases()).resolves.toBe(3);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("WHERE billing_mode IS NULL");
    expect(sql).toContain("checkout_session_id IS NOT NULL");
    expect(sql).toContain("payment_intent_id IS NOT NULL");
    expect(sql).toContain("status IN ('paid', 'refunded', 'disputed')");
  });
});

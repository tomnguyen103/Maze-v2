import { recordPaidFact, transitionFact } from "../server/financial-facts.js";
import { describe, expect, it, vi } from "vitest";

const PAID_AT = new Date("2026-10-09T10:00:00.000Z");

function clientStub() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe("Financial Facts", () => {
  it("US-01.1 writes one paid live fact with the spec amount and currency", async () => {
    const client = clientStub();

    await recordPaidFact(client, {
      paymentIntentId: "pi_live_echo",
      billingMode: "live",
      eventCreated: 100,
      paidAt: PAID_AT
    });

    expect(client.query).toHaveBeenCalledOnce();
    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO financial_facts");
    expect(sql).toContain("'paid'");
    expect(values).toEqual(["pi_live_echo", "live", 599, "usd", PAID_AT, 100]);
  });

  it("US-01.2 stores the test Billing Mode on a test-mode fact", async () => {
    const client = clientStub();

    await recordPaidFact(client, {
      paymentIntentId: "pi_test_echo",
      billingMode: "test",
      eventCreated: 100,
      paidAt: PAID_AT
    });

    expect(client.query.mock.calls[0][1]).toEqual([
      "pi_test_echo",
      "test",
      599,
      "usd",
      PAID_AT,
      100
    ]);
  });

  it("US-01.4 keeps one row per payment intent and only advances its event clock", async () => {
    const client = clientStub();

    await recordPaidFact(client, {
      paymentIntentId: "pi_live_echo",
      billingMode: "live",
      eventCreated: 100,
      paidAt: PAID_AT
    });

    const sql = String(client.query.mock.calls[0][0]).replace(/\s+/g, " ");
    expect(sql).toContain("ON CONFLICT (payment_intent_id) DO UPDATE");
    expect(sql).toContain("GREATEST( financial_facts.provider_event_created, EXCLUDED.provider_event_created )");
  });
});

/**
 * A one-row stand-in for `financial_facts` that applies the helper's UPDATE
 * with the same old-row semantics as Postgres.
 * @param {null | Record<string, unknown>} initial
 */
function factTable(initial) {
  /** @type {Record<string, unknown> | null} */
  let row = initial ? { refunded_at: null, disputed_at: null, ...initial } : null;
  const query = vi.fn(async (sql, values = []) => {
    const text = String(sql);
    if (text.includes("SELECT status")) {
      const [paymentIntentId, billingMode] = values;
      const match = row && row.payment_intent_id === paymentIntentId && row.billing_mode === billingMode;
      return { rows: match ? [{ ...row }] : [] };
    }
    if (text.includes("UPDATE financial_facts") && row) {
      const [, status, refundedCents, eventCreated] = values;
      row = {
        ...row,
        refunded_at: status === "refunded" && row.status !== "refunded" ? "now" : row.refunded_at,
        disputed_at: status === "disputed" && row.status !== "disputed" ? "now" : row.disputed_at,
        status,
        refunded_cents: refundedCents,
        provider_event_created: eventCreated
      };
    }
    return { rows: [] };
  });
  return { client: { query }, read: () => row };
}

const PAID_FACT = {
  payment_intent_id: "pi_live_echo",
  billing_mode: "live",
  status: "paid",
  refunded_cents: 0,
  provider_event_created: 100
};

/** @param {Partial<Parameters<typeof transitionFact>[1]>} overrides */
function factEvent(overrides) {
  return {
    paymentIntentId: "pi_live_echo",
    billingMode: /** @type {const} */ ("live"),
    eventCreated: 200,
    requestedState: null,
    refundedCents: 0,
    ...overrides
  };
}

describe("Financial Fact transitions", () => {
  it("US-02.1 marks a fully refunded fact with its cents and time", async () => {
    const table = factTable(PAID_FACT);

    await expect(
      transitionFact(table.client, factEvent({ requestedState: "refunded", refundedCents: 599 }))
    ).resolves.toBe("processed");

    expect(table.read()).toMatchObject({
      status: "refunded",
      refunded_cents: 599,
      refunded_at: "now",
      provider_event_created: 200
    });
  });

  it("US-02.2 keeps a partially refunded fact paid and accumulates its cents", async () => {
    const table = factTable(PAID_FACT);

    await transitionFact(table.client, factEvent({ refundedCents: 300 }));
    expect(table.read()).toMatchObject({ status: "paid", refunded_cents: 300, refunded_at: null });

    await transitionFact(table.client, factEvent({ eventCreated: 210, refundedCents: 500 }));
    expect(table.read()).toMatchObject({ status: "paid", refunded_cents: 500 });

    await expect(
      transitionFact(table.client, factEvent({ eventCreated: 205, refundedCents: 300 }))
    ).resolves.toBe("ignored");
    expect(table.read()).toMatchObject({ refunded_cents: 500 });
  });

  it("US-02.3 never reverses a refunded fact on a later paid or won event", async () => {
    const table = factTable({ ...PAID_FACT, status: "refunded", refunded_cents: 599 });

    await expect(
      transitionFact(table.client, factEvent({ eventCreated: 300, requestedState: "active", refundedCents: 599 }))
    ).resolves.toBe("ignored");
    expect(table.read()).toMatchObject({ status: "refunded" });
  });

  it("US-02.4 leaves the fact unchanged on a repeated or older event", async () => {
    const table = factTable({ ...PAID_FACT, status: "disputed", provider_event_created: 200 });

    await expect(
      transitionFact(table.client, factEvent({ requestedState: "disputed" }))
    ).resolves.toBe("duplicate");
    await expect(
      transitionFact(table.client, factEvent({ eventCreated: 150, requestedState: "active" }))
    ).resolves.toBe("stale");
    expect(table.client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE financial_facts"))).toBe(false);
    expect(table.read()).toMatchObject({ status: "disputed", provider_event_created: 200 });
  });

  it("US-02.5 returns a disputed fact to paid only when the dispute is won", async () => {
    const table = factTable(PAID_FACT);

    await transitionFact(table.client, factEvent({ requestedState: "disputed" }));
    expect(table.read()).toMatchObject({ status: "disputed", disputed_at: "now" });

    await transitionFact(table.client, factEvent({ eventCreated: 300, requestedState: "active" }));
    expect(table.read()).toMatchObject({ status: "paid", provider_event_created: 300 });
  });

  it("US-03.5 creates nothing for a payment with no fact", async () => {
    const table = factTable(null);

    await expect(
      transitionFact(table.client, factEvent({ requestedState: "refunded", refundedCents: 599 }))
    ).resolves.toBe("missing");
    expect(table.client.query).toHaveBeenCalledOnce();
    expect(table.read()).toBeNull();
  });

  it("US-01.2 never moves a fact across Billing Modes", async () => {
    const table = factTable({ ...PAID_FACT, billing_mode: "test" });

    await expect(
      transitionFact(table.client, factEvent({ requestedState: "refunded", refundedCents: 599 }))
    ).resolves.toBe("missing");
    expect(table.read()).toMatchObject({ status: "paid" });
  });
});

import { recordFact, transitionFact } from "../server/financial-facts.js";
import { describe, expect, it, vi } from "vitest";

function clientStub() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe("Financial Facts", () => {
  it("US-01.1 writes one paid live fact with the spec amount and currency", async () => {
    const client = clientStub();

    await recordFact(client, {
      paymentIntentId: "pi_live_echo",
      billingMode: "live",
      eventCreated: 100,
      status: "paid",
      refundedCents: 0
    });

    expect(client.query).toHaveBeenCalledOnce();
    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO financial_facts");
    expect(values).toEqual(["pi_live_echo", "live", 599, "usd", "paid", 0, 100]);
  });

  it("US-01.2 stores the test Billing Mode on a test-mode fact", async () => {
    const client = clientStub();

    await recordFact(client, {
      paymentIntentId: "pi_test_echo",
      billingMode: "test",
      eventCreated: 100,
      status: "paid",
      refundedCents: 0
    });

    expect(client.query.mock.calls[0][1]).toEqual([
      "pi_test_echo",
      "test",
      599,
      "usd",
      "paid",
      0,
      100
    ]);
  });

  it("US-01.4 keeps one row per payment intent and merges a later charge snapshot", async () => {
    const client = clientStub();

    await recordFact(client, {
      paymentIntentId: "pi_live_echo",
      billingMode: "live",
      eventCreated: 100,
      status: "paid",
      refundedCents: 0
    });

    const sql = String(client.query.mock.calls[0][0]).replace(/\s+/g, " ");
    expect(sql).toContain("ON CONFLICT (payment_intent_id) DO UPDATE");
    expect(sql).toContain("GREATEST( financial_facts.provider_event_created, EXCLUDED.provider_event_created )");
    expect(sql).toContain("refunded_cents = GREATEST(financial_facts.refunded_cents, EXCLUDED.refunded_cents)");
    expect(sql).toContain(
      "SET status = CASE WHEN EXCLUDED.refunded_cents >= financial_facts.amount_cents THEN 'refunded' ELSE financial_facts.status END"
    );
    expect(sql).toContain("THEN COALESCE(financial_facts.refunded_at, NOW())");
    expect(sql).toContain(
      "partial_refunded_cents = CASE WHEN financial_facts.refunded_at IS NOT NULL OR EXCLUDED.refunded_cents >= financial_facts.amount_cents THEN financial_facts.partial_refunded_cents ELSE GREATEST(financial_facts.refunded_cents, EXCLUDED.refunded_cents) END"
    );
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
    if (text.includes("INSERT INTO financial_facts")) {
      const [paymentIntentId, billingMode, , , status, refundedCents, eventCreated] = values;
      const full = row && Number(refundedCents) >= Number(row.amount_cents ?? 599);
      row = row
        ? {
            ...row,
            status: full ? "refunded" : row.status,
            refunded_at: full ? (row.refunded_at ?? "now") : row.refunded_at,
            partial_refunded_cents:
              row.refunded_at !== null || full
                ? row.partial_refunded_cents
                : Math.max(Number(row.refunded_cents), Number(refundedCents)),
            refunded_cents: Math.max(Number(row.refunded_cents), Number(refundedCents)),
            provider_event_created: Math.max(Number(row.provider_event_created), Number(eventCreated))
          }
        : {
            payment_intent_id: paymentIntentId,
            billing_mode: billingMode,
            status,
            refunded_cents: refundedCents,
            partial_refunded_cents: status === "refunded" ? 0 : refundedCents,
            refunded_at: status === "refunded" ? "now" : null,
            disputed_at: status === "disputed" ? "now" : null,
            provider_event_created: eventCreated
          };
      return { rows: [] };
    }
    if (text.includes("SELECT status")) {
      const [paymentIntentId, billingMode] = values;
      const match = row && row.payment_intent_id === paymentIntentId && row.billing_mode === billingMode;
      return { rows: match ? [{ ...row }] : [] };
    }
    if (text.includes("UPDATE financial_facts") && row) {
      const [, status, refundedCents, eventCreated] = values;
      row = {
        ...row,
        partial_refunded_cents:
          status === "refunded" || row.refunded_at !== null ? row.partial_refunded_cents : refundedCents,
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
  partial_refunded_cents: 0,
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

  it("US-02.6 keeps the partial refunded cents when a full refund follows a partial refund", async () => {
    const table = factTable(PAID_FACT);

    await transitionFact(table.client, factEvent({ refundedCents: 100 }));
    expect(table.read()).toMatchObject({ refunded_cents: 100, partial_refunded_cents: 100 });

    await transitionFact(
      table.client,
      factEvent({ eventCreated: 210, requestedState: "refunded", refundedCents: 599 })
    );
    expect(table.read()).toMatchObject({
      status: "refunded",
      refunded_cents: 599,
      partial_refunded_cents: 100,
      refunded_at: "now"
    });
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

  it("US-02.3 makes a fully refunded fact refunded even when the refund event is older", async () => {
    const table = factTable({ ...PAID_FACT, status: "disputed", provider_event_created: 300 });

    await expect(
      transitionFact(table.client, factEvent({ eventCreated: 250, requestedState: "refunded", refundedCents: 599 }))
    ).resolves.toBe("processed");
    expect(table.read()).toMatchObject({
      status: "refunded",
      refunded_cents: 599,
      refunded_at: "now",
      provider_event_created: 300
    });

    await expect(
      transitionFact(table.client, factEvent({ eventCreated: 400, requestedState: "active", refundedCents: 599 }))
    ).resolves.toBe("ignored");
    expect(table.read()).toMatchObject({ status: "refunded" });
  });

  it("US-02.5 returns a disputed fact to paid only when the dispute is won", async () => {
    const table = factTable(PAID_FACT);

    await transitionFact(table.client, factEvent({ requestedState: "disputed" }));
    expect(table.read()).toMatchObject({ status: "disputed", disputed_at: "now" });

    await transitionFact(table.client, factEvent({ eventCreated: 300, requestedState: "active" }));
    expect(table.read()).toMatchObject({ status: "paid", provider_event_created: 300 });
  });

  it("US-02.7 records the partial refunded cents of a paid fact and none for a refunded fact", async () => {
    const paid = factTable(null);
    await recordFact(paid.client, {
      paymentIntentId: "pi_live_echo",
      billingMode: "live",
      eventCreated: 100,
      status: "paid",
      refundedCents: 200
    });
    expect(paid.read()).toMatchObject({ refunded_cents: 200, partial_refunded_cents: 200, refunded_at: null });

    const refunded = factTable(null);
    await recordFact(refunded.client, {
      paymentIntentId: "pi_live_echo",
      billingMode: "live",
      eventCreated: 100,
      status: "refunded",
      refundedCents: 599
    });
    expect(refunded.read()).toMatchObject({
      refunded_cents: 599,
      partial_refunded_cents: 0,
      refunded_at: "now"
    });
  });

  it("US-02.7 freezes the partial refunded cents when a repeat write carries the full refund", async () => {
    const table = factTable(null);
    const fact = {
      paymentIntentId: "pi_live_echo",
      billingMode: /** @type {const} */ ("live"),
      eventCreated: 100,
      status: /** @type {const} */ ("paid"),
      refundedCents: 100
    };
    await recordFact(table.client, fact);
    await recordFact(table.client, { ...fact, eventCreated: 110, refundedCents: 599 });

    expect(table.read()).toMatchObject({
      status: "refunded",
      refunded_cents: 599,
      partial_refunded_cents: 100
    });
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

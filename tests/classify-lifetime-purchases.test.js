import { describe, expect, it, vi } from "vitest";
import {
  classifyPurchases,
  createPurchaseClassificationStore
} from "../scripts/classify-lifetime-purchases.mjs";

/** @param {Record<string, unknown>} overrides */
function purchase(overrides) {
  return {
    id: "lp_1",
    status: "paid",
    checkoutSessionId: "cs_1",
    paymentIntentId: "pi_1",
    billingMode: null,
    ...overrides
  };
}

/** @param {ReturnType<typeof purchase>[]} rows */
function memoryStore(rows) {
  const state = rows.map((row) => ({ ...row }));
  return {
    state,
    listUnclassified: vi.fn(async () =>
      state
        .filter((row) => row.billingMode === null)
        .map(({ id, status, checkoutSessionId, paymentIntentId }) => ({
          id,
          status,
          checkoutSessionId,
          paymentIntentId
        }))
    ),
    writeBillingModes: vi.fn(async (updates) => {
      for (const update of updates) {
        const row = state.find((candidate) => candidate.id === update.id);
        if (row?.billingMode !== null) {
          throw new Error(`${update.id} already has a Billing Mode.`);
        }
        row.billingMode = update.mode;
      }
    })
  };
}

/**
 * A value that is an Error is thrown. An unknown id resolves to null, which
 * stands for an object Stripe did not return.
 *
 * @param {{ sessions?: Record<string, unknown>, paymentIntents?: Record<string, unknown> }} objects
 */
function stripeStub({ sessions = {}, paymentIntents = {} }) {
  const fetchFrom = (/** @type {Record<string, unknown>} */ table) =>
    vi.fn(async (/** @type {string} */ id) => {
      const value = table[id] ?? null;
      if (value instanceof Error) throw value;
      return value;
    });
  return {
    checkout: { sessions: { retrieve: fetchFrom(sessions) } },
    paymentIntents: { retrieve: fetchFrom(paymentIntents) }
  };
}

/** @param {string} code */
function stripeError(code) {
  return Object.assign(new Error(`Stripe ${code}`), { code });
}

const AGREEING_ROWS = [
  purchase({ id: "lp_1", checkoutSessionId: "cs_1", paymentIntentId: "pi_1" }),
  purchase({ id: "lp_2", checkoutSessionId: "cs_2", paymentIntentId: "pi_2" })
];

const AGREEING_OBJECTS = {
  sessions: {
    cs_1: { livemode: false, payment_intent: "pi_1", payment_status: "paid" },
    cs_2: { livemode: true, payment_intent: "pi_2", payment_status: "paid" }
  },
  paymentIntents: { pi_1: { livemode: false }, pi_2: { livemode: true } }
};

/** @param {Awaited<ReturnType<typeof classifyPurchases>>} result */
function problemsOf(result) {
  return Object.fromEntries(
    result.results.filter((row) => row.problem !== null).map((row) => [row.id, row.problem])
  );
}

describe("classify lifetime purchases script", () => {
  it("US-10.1 dry-run prints the verified livemode per row, exits 0 and writes nothing", async () => {
    const store = memoryStore(AGREEING_ROWS);
    const stripe = stripeStub(AGREEING_OBJECTS);
    const lines = /** @type {string[]} */ ([]);

    const result = await classifyPurchases({
      store,
      stripe,
      apply: false,
      log: (line) => lines.push(line)
    });

    expect(result.exitCode).toBe(0);
    expect(lines).toEqual(["lp_1 mode=test dry-run", "lp_2 mode=live dry-run"]);
    expect(lines.join("\n")).not.toMatch(/sk_|rk_|whsec_/);
    expect(store.writeBillingModes).not.toHaveBeenCalled();
    expect(store.state.map((row) => row.billingMode)).toEqual([null, null]);
  });

  it("US-10.2 --apply writes one batch of verified modes when the Session and the PaymentIntent agree", async () => {
    const store = memoryStore(AGREEING_ROWS);
    const stripe = stripeStub(AGREEING_OBJECTS);
    const lines = /** @type {string[]} */ ([]);

    const result = await classifyPurchases({
      store,
      stripe,
      apply: true,
      log: (line) => lines.push(line)
    });

    expect(result.exitCode).toBe(0);
    expect(store.writeBillingModes).toHaveBeenCalledTimes(1);
    expect(store.writeBillingModes).toHaveBeenCalledWith([
      { id: "lp_1", mode: "test" },
      { id: "lp_2", mode: "live" }
    ]);
    expect(store.state.map((row) => row.billingMode)).toEqual(["test", "live"]);
    expect(lines).toEqual(["lp_1 mode=test written", "lp_2 mode=live written"]);
  });

  it("US-10.3 reports a missing id, a missing object and a conflict, leaves them unchanged and exits 1", async () => {
    const store = memoryStore([
      purchase({ id: "lp_ok", checkoutSessionId: "cs_ok", paymentIntentId: "pi_ok" }),
      purchase({ id: "lp_no_session", checkoutSessionId: null }),
      purchase({ id: "lp_no_object", checkoutSessionId: "cs_gone", paymentIntentId: "pi_gone" }),
      purchase({ id: "lp_conflict", checkoutSessionId: "cs_mixed", paymentIntentId: "pi_mixed" })
    ]);
    const stripe = stripeStub({
      sessions: {
        cs_ok: { livemode: false, payment_intent: "pi_ok" },
        cs_gone: { livemode: false, payment_intent: "pi_gone" },
        cs_mixed: { livemode: true, payment_intent: "pi_mixed" }
      },
      paymentIntents: {
        pi_ok: { livemode: false },
        pi_gone: null,
        pi_mixed: { livemode: false }
      }
    });
    const lines = /** @type {string[]} */ ([]);

    const result = await classifyPurchases({
      store,
      stripe,
      apply: true,
      log: (line) => lines.push(line)
    });

    expect(result.exitCode).toBe(1);
    expect(problemsOf(result)).toEqual({
      lp_no_session: "missing_session_id",
      lp_no_object: "missing_payment_intent_object",
      lp_conflict: "livemode_conflict"
    });
    expect(store.writeBillingModes).toHaveBeenCalledWith([{ id: "lp_ok", mode: "test" }]);
    expect(
      Object.fromEntries(store.state.map((row) => [row.id, row.billingMode]))
    ).toEqual({
      lp_ok: "test",
      lp_no_session: null,
      lp_no_object: null,
      lp_conflict: null
    });
    expect(lines).toContain("lp_conflict problem=livemode_conflict unchanged");
  });

  it("US-10.3 reports a Session whose PaymentIntent differs from the stored one", async () => {
    const store = memoryStore([
      purchase({ id: "lp_swap", checkoutSessionId: "cs_swap", paymentIntentId: "pi_stored" })
    ]);
    const stripe = stripeStub({
      sessions: { cs_swap: { livemode: false, payment_intent: "pi_other" } },
      paymentIntents: { pi_stored: { livemode: false } }
    });

    const result = await classifyPurchases({ store, stripe, apply: true, log: () => {} });

    expect(result.exitCode).toBe(1);
    expect(problemsOf(result)).toEqual({ lp_swap: "payment_intent_mismatch" });
    expect(store.writeBillingModes).not.toHaveBeenCalled();
  });

  it("US-10.3 reports a paid row that stores no PaymentIntent id", async () => {
    const store = memoryStore([
      purchase({ id: "lp_paid_bare", status: "refunded", paymentIntentId: null })
    ]);
    const stripe = stripeStub(AGREEING_OBJECTS);

    const result = await classifyPurchases({ store, stripe, apply: true, log: () => {} });

    expect(problemsOf(result)).toEqual({ lp_paid_bare: "missing_payment_intent_id" });
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(store.writeBillingModes).not.toHaveBeenCalled();
  });

  it("US-10.3 an abandoned Checkout takes the Session livemode when no money moved", async () => {
    const store = memoryStore([
      purchase({ id: "lp_open", status: "open", checkoutSessionId: "cs_open", paymentIntentId: null }),
      purchase({ id: "lp_late", status: "open", checkoutSessionId: "cs_late", paymentIntentId: null })
    ]);
    const stripe = stripeStub({
      sessions: {
        cs_open: { livemode: true, payment_intent: null, payment_status: "unpaid" },
        cs_late: { livemode: true, payment_intent: "pi_late", payment_status: "paid" }
      }
    });

    const result = await classifyPurchases({ store, stripe, apply: true, log: () => {} });

    expect(problemsOf(result)).toEqual({ lp_late: "paid_without_payment_intent_id" });
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(store.writeBillingModes).toHaveBeenCalledWith([{ id: "lp_open", mode: "live" }]);
  });

  it("US-10.3 an object of the other mode is reported and the run goes on", async () => {
    const store = memoryStore([
      purchase({ id: "lp_other_key", checkoutSessionId: "cs_other", paymentIntentId: "pi_other" }),
      purchase({ id: "lp_ok", checkoutSessionId: "cs_ok", paymentIntentId: "pi_ok" })
    ]);
    const stripe = stripeStub({
      sessions: {
        cs_other: stripeError("resource_missing"),
        cs_ok: { livemode: false, payment_intent: "pi_ok" }
      },
      paymentIntents: { pi_ok: { livemode: false } }
    });

    const result = await classifyPurchases({ store, stripe, apply: true, log: () => {} });

    expect(result.exitCode).toBe(1);
    expect(problemsOf(result)).toEqual({ lp_other_key: "missing_session_object" });
    expect(store.writeBillingModes).toHaveBeenCalledWith([{ id: "lp_ok", mode: "test" }]);
  });

  it("US-10.4 a second --apply run reads no classified row, calls no Stripe object and changes nothing", async () => {
    const store = memoryStore(AGREEING_ROWS);
    const stripe = stripeStub(AGREEING_OBJECTS);

    await classifyPurchases({ store, stripe, apply: true, log: () => {} });
    const stateAfterFirstRun = store.state.map((row) => row.billingMode);
    stripe.checkout.sessions.retrieve.mockClear();
    stripe.paymentIntents.retrieve.mockClear();
    store.writeBillingModes.mockClear();

    const result = await classifyPurchases({ store, stripe, apply: true, log: () => {} });

    expect(result.exitCode).toBe(0);
    expect(result.results).toEqual([]);
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(store.writeBillingModes).not.toHaveBeenCalled();
    expect(store.state.map((row) => row.billingMode)).toEqual(stateAfterFirstRun);
  });

  it("US-10.5 a Stripe error stops the run before the first write", async () => {
    const store = memoryStore(AGREEING_ROWS);
    const stripe = stripeStub({
      sessions: {
        cs_1: AGREEING_OBJECTS.sessions.cs_1,
        cs_2: new Error("Stripe is unavailable")
      },
      paymentIntents: AGREEING_OBJECTS.paymentIntents
    });

    await expect(
      classifyPurchases({ store, stripe, apply: true, log: () => {} })
    ).rejects.toThrow("Stripe is unavailable");

    expect(store.writeBillingModes).not.toHaveBeenCalled();
    expect(store.state.map((row) => row.billingMode)).toEqual([null, null]);
  });

  it("US-10.5 a failed update rolls back the whole batch and releases the connection", async () => {
    let updates = 0;
    const client = {
      query: vi.fn(async (sql) => {
        if (sql.startsWith("UPDATE")) {
          updates += 1;
          return { rowCount: updates === 1 ? 1 : 0, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      }),
      release: vi.fn()
    };
    const pool = { query: vi.fn(), connect: vi.fn(async () => client) };

    await expect(
      createPurchaseClassificationStore(pool).writeBillingModes([
        { id: "lp_1", mode: "test" },
        { id: "lp_2", mode: "live" }
      ])
    ).rejects.toThrow("changed during classification");

    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("US-10.4 the store reads only rows with an empty Billing Mode and guards every update", async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [] })),
      release: vi.fn()
    };
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
      connect: vi.fn(async () => client)
    };
    const store = createPurchaseClassificationStore(pool);

    await store.listUnclassified();
    await store.writeBillingModes([{ id: "lp_1", mode: "live" }]);

    const readCalls = /** @type {unknown[][]} */ (pool.query.mock.calls);
    expect(String(readCalls[0]?.[0])).toMatch(/WHERE billing_mode IS NULL/);
    const writeCalls = /** @type {unknown[][]} */ (client.query.mock.calls);
    const update = writeCalls.find((call) => String(call[0]).startsWith("UPDATE"));
    expect(String(update?.[0])).toMatch(/AND billing_mode IS NULL/);
    expect(update?.[1]).toEqual(["lp_1", "live"]);
  });

  it("US-05.5 the write copies the verified mode onto the matching empty projection in the same transaction", async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [] })),
      release: vi.fn()
    };
    const pool = { query: vi.fn(), connect: vi.fn(async () => client) };

    await createPurchaseClassificationStore(pool).writeBillingModes([
      { id: "lp_1", mode: "live" },
      { id: "lp_2", mode: "test" }
    ]);

    const calls = /** @type {unknown[][]} */ (client.query.mock.calls);
    const statements = calls.map(([sql]) => String(sql));
    const projection = calls.find((call) => String(call[0]).includes("UPDATE player_access"));
    expect(String(projection?.[0])).toMatch(/membership_mode IS NULL/);
    expect(projection?.[1]).toEqual([["lp_1", "lp_2"]]);
    expect(statements.indexOf("BEGIN")).toBeLessThan(statements.indexOf(String(projection?.[0])));
    expect(statements.indexOf(String(projection?.[0]))).toBeLessThan(statements.indexOf("COMMIT"));
  });

  it("US-09.2 the store lists only rows that carry a Stripe object or a paid status", async () => {
    const pool = {
      query: vi.fn(async () => ({
        rows: [
          {
            id: "lp_1",
            status: "open",
            checkout_session_id: "cs_1",
            payment_intent_id: null
          }
        ]
      })),
      connect: vi.fn()
    };

    const rows = await createPurchaseClassificationStore(pool).listUnclassified();

    expect(rows).toEqual([
      { id: "lp_1", status: "open", checkoutSessionId: "cs_1", paymentIntentId: null }
    ]);
    const queryCalls = /** @type {unknown[][]} */ (pool.query.mock.calls);
    expect(String(queryCalls[0]?.[0])).toMatch(
      /checkout_session_id IS NOT NULL[\s\S]*payment_intent_id IS NOT NULL[\s\S]*status IN \('paid', 'refunded', 'disputed'\)/
    );
  });
});

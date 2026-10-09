import { describe, expect, it, vi } from "vitest";
import {
  classifyPurchases,
  createPurchaseClassificationStore
} from "../scripts/classify-lifetime-purchases.mjs";

/** @param {Record<string, unknown>} overrides */
function purchase(overrides) {
  return {
    id: "lp_1",
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
        .map(({ id, checkoutSessionId, paymentIntentId }) => ({
          id,
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

const AGREEING_ROWS = [
  purchase({ id: "lp_1", checkoutSessionId: "cs_1", paymentIntentId: "pi_1" }),
  purchase({ id: "lp_2", checkoutSessionId: "cs_2", paymentIntentId: "pi_2" })
];

const AGREEING_OBJECTS = {
  sessions: { cs_1: { livemode: false }, cs_2: { livemode: true } },
  paymentIntents: { pi_1: { livemode: false }, pi_2: { livemode: true } }
};

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
        cs_ok: { livemode: false },
        cs_gone: { livemode: false },
        cs_mixed: { livemode: true }
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
    const problems = Object.fromEntries(
      result.results
        .filter((row) => row.problem !== null)
        .map((row) => [row.id, row.problem])
    );
    expect(problems).toEqual({
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
      sessions: { cs_1: { livemode: false }, cs_2: new Error("Stripe is unavailable") },
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
});

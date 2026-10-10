import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createLifetimeStore } from "../server/lifetime-store.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(databaseUrl);
/** @type {Pool | null} */
let pool = null;

/** @typedef {import("pg").PoolClient} Connection */
/** @typedef {ReturnType<typeof createLifetimeStore>} LifetimeStore */
/** @typedef {ReturnType<typeof purchase>} Checkout */
/**
 * @typedef {(
 *   store: LifetimeStore,
 *   checkout: Checkout,
 *   read: () => ReturnType<typeof outcome>
 * ) => Promise<unknown>} Order
 */

/**
 * Gives the store one connection inside an outer transaction. Each store
 * transaction becomes a savepoint, so the test commits nothing and no
 * Funnel Count of a parallel lane file moves.
 *
 * @param {Connection} connection
 */
function savepointPool(connection) {
  /** @param {string} sql @param {unknown[]} [values] */
  const query = (sql, values) => {
    if (sql === "BEGIN") return connection.query("SAVEPOINT store_tx");
    if (sql === "COMMIT") return connection.query("RELEASE SAVEPOINT store_tx");
    if (sql === "ROLLBACK") return connection.query("ROLLBACK TO SAVEPOINT store_tx");
    return connection.query(sql, values);
  };
  return { connect: async () => ({ query, release: () => undefined }), query };
}

/** Each purchase gets its own account, PaymentIntent and Checkout Session. */
function purchase() {
  return {
    sessionId: `cs_test_race_${randomUUID()}`,
    purchaseId: randomUUID(),
    ownerId: `lifetime_race_${randomUUID()}`,
    priceId: "price_test_race",
    paymentIntentId: `pi_race_${randomUUID()}`
  };
}

/**
 * The confirm write after a Stripe read that saw the charge paid with no
 * refund.
 *
 * @param {LifetimeStore} store
 * @param {Checkout} checkout
 */
function confirmWrite(store, checkout) {
  return store.activatePurchase({ ...checkout, refundedCents: 0 }, null);
}

/**
 * @param {LifetimeStore} store
 * @param {Checkout} checkout
 * @param {"refunded" | null} state
 * @param {number} refundedCents
 */
function refundWebhook(store, checkout, state, refundedCents) {
  return store.transitionEntitlement({
    eventCreated: 1001,
    eventId: `evt_refund_${randomUUID()}`,
    eventType: "charge.refunded",
    ownerId: checkout.ownerId,
    paymentIntentId: checkout.paymentIntentId,
    purchaseId: checkout.purchaseId,
    refundedCents,
    state
  });
}

/**
 * The `checkout.session.completed` webhook reads the charge as it is now.
 *
 * @param {LifetimeStore} store
 * @param {Checkout} checkout
 * @param {"paid" | "refunded"} paymentState
 * @param {number} refundedCents
 */
function completedWebhook(store, checkout, paymentState, refundedCents) {
  return store.activatePurchase(
    { ...checkout, paymentState, refundedCents },
    {
      eventCreated: 1000,
      eventId: `evt_completed_${randomUUID()}`,
      eventType: "checkout.session.completed"
    }
  );
}

/**
 * @param {Connection} connection
 * @param {Checkout} checkout
 */
async function outcome(connection, checkout) {
  const fact = await connection.query(
    `SELECT status, refunded_cents, partial_refunded_cents,
            provider_event_created::text AS provider_event_created,
            refunded_at IS NOT NULL AS refunded, disputed_at IS NOT NULL AS disputed
     FROM financial_facts WHERE payment_intent_id = $1`,
    [checkout.paymentIntentId]
  );
  const access = await connection.query(
    `SELECT a.membership_state, p.status AS purchase_status
     FROM player_access a
     JOIN lifetime_purchases p ON p.player_id = a.clerk_user_id
     WHERE a.clerk_user_id = $1`,
    [checkout.ownerId]
  );
  return { facts: fact.rowCount, fact: fact.rows[0], access: access.rows[0] };
}

/**
 * Runs one purchase in the raced order and one in the serial order, then
 * rolls both back.
 *
 * @param {Order} raced
 * @param {Order} serial
 */
async function compare(raced, serial) {
  if (!pool) throw new Error("Database pool was not initialized.");
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const store = createLifetimeStore(
      /** @type {Parameters<typeof createLifetimeStore>[0]} */ (
        /** @type {unknown} */ (savepointPool(connection))
      ),
      { mode: "test" }
    );
    /** @type {Record<string, Awaited<ReturnType<typeof outcome>>>} */
    const results = {};
    for (const [name, order] of /** @type {const} */ ([["raced", raced], ["serial", serial]])) {
      const checkout = purchase();
      await store.reservePurchase(checkout.ownerId, checkout.purchaseId, checkout.priceId);
      await store.attachCheckout(checkout.purchaseId, checkout.sessionId);
      await order(store, checkout, () => outcome(connection, checkout));
      results[name] = await outcome(connection, checkout);
    }
    return results;
  } finally {
    await connection.query("ROLLBACK").catch(() => undefined);
    connection.release();
  }
}

describe.runIf(runIntegration)("Lifetime confirm against a refund between its read and its write", () => {
  beforeAll(() => {
    pool = new Pool({
      connectionString: normalizeDatabaseConnectionString(databaseUrl),
      max: 1
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("US-04.1 converges to the serial fact after a full refund in the gap", async () => {
    const { raced, serial } = await compare(
      async (store, checkout, read) => {
        await refundWebhook(store, checkout, "refunded", 599);
        // The stale confirm grants nothing, and the fact is still missing.
        await expect(confirmWrite(store, checkout)).resolves.toMatchObject({ outcome: "ignored" });
        expect((await read()).facts).toBe(0);
        await completedWebhook(store, checkout, "refunded", 599);
      },
      async (store, checkout) => {
        await confirmWrite(store, checkout);
        await refundWebhook(store, checkout, "refunded", 599);
        await completedWebhook(store, checkout, "refunded", 599);
      }
    );

    expect(raced).toEqual(serial);
    expect(raced).toMatchObject({
      facts: 1,
      fact: { status: "refunded", refunded_cents: 599, partial_refunded_cents: 0, refunded: true },
      access: { membership_state: "refunded", purchase_status: "refunded" }
    });
  });

  it("US-04.2 converges to the serial fact after a partial refund in the gap", async () => {
    const { raced, serial } = await compare(
      async (store, checkout, read) => {
        await refundWebhook(store, checkout, null, 300);
        await confirmWrite(store, checkout);
        // The stale confirm writes the cents it read.
        expect((await read()).fact).toMatchObject({ refunded_cents: 0 });
        await completedWebhook(store, checkout, "paid", 300);
      },
      async (store, checkout) => {
        await confirmWrite(store, checkout);
        await refundWebhook(store, checkout, null, 300);
        await completedWebhook(store, checkout, "paid", 300);
      }
    );

    expect(raced).toEqual(serial);
    expect(raced).toMatchObject({
      facts: 1,
      fact: { status: "paid", refunded_cents: 300, partial_refunded_cents: 300, refunded: false },
      access: { membership_state: "active", purchase_status: "paid" }
    });
  });
});

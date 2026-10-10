import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { recordFact, transitionFact } from "../server/financial-facts.js";

const adminDatabaseUrl = process.env.DATABASE_ADMIN_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(adminDatabaseUrl);
/** @type {Pool | null} */
let adminPool = null;

/** @typedef {import("pg").PoolClient} Connection */
/** @typedef {(connection: Connection) => Promise<unknown>} Write */

function pool() {
  if (!adminPool) throw new Error("Database pool was not initialized.");
  return adminPool;
}

/**
 * Polls `pg_stat_activity` on a third connection until the backend waits for
 * a lock, so the test proves the wait before it releases the first
 * transaction.
 *
 * @param {number} pid
 */
async function waitsForLock(pid) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await pool().query(
      `SELECT 1 FROM pg_stat_activity
       WHERE pid = $1 AND wait_event_type = 'Lock'`,
      [pid]
    );
    if (result.rowCount) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

/**
 * Runs two writes on two open transactions. The second write must wait for
 * the first, so the first commits only after the wait is proven.
 *
 * @param {Write} first
 * @param {Write} second
 */
async function concurrently(first, second) {
  const a = await pool().connect();
  const b = await pool().connect();
  try {
    const pidB = Number(
      (await b.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid
    );
    await a.query("BEGIN");
    await b.query("BEGIN");
    await first(a);
    const pending = second(b);
    // Keep a rejection from going unhandled while the wait is polled.
    pending.catch(() => undefined);
    expect(await waitsForLock(pidB)).toBe(true);
    await a.query("COMMIT");
    await pending;
    await b.query("COMMIT");
  } finally {
    await a.query("ROLLBACK").catch(() => undefined);
    await b.query("ROLLBACK").catch(() => undefined);
    a.release();
    b.release();
  }
}

/**
 * @param {Write} first
 * @param {Write} second
 */
async function serially(first, second) {
  const connection = await pool().connect();
  try {
    await first(connection);
    await second(connection);
  } finally {
    connection.release();
  }
}

/** @param {string} id */
async function snapshot(id) {
  const result = await pool().query(
    `SELECT status, refunded_cents, provider_event_created::text AS provider_event_created,
            refunded_at IS NOT NULL AS refunded, disputed_at IS NOT NULL AS disputed
     FROM financial_facts WHERE payment_intent_id = $1`,
    [id]
  );
  return { rows: result.rowCount, fact: result.rows[0] };
}

/**
 * @param {string} id
 * @param {"paid" | "refunded" | "disputed"} status
 * @param {number} eventCreated
 * @param {number} refundedCents
 * @returns {Write}
 */
function record(id, status, eventCreated, refundedCents) {
  return (connection) =>
    recordFact(connection, {
      paymentIntentId: id,
      billingMode: "live",
      eventCreated,
      status,
      refundedCents
    });
}

/**
 * @param {string} id
 * @param {"refunded" | "disputed"} requestedState
 * @param {number} eventCreated
 * @param {number} refundedCents
 * @returns {Write}
 */
function transition(id, requestedState, eventCreated, refundedCents) {
  return (connection) =>
    transitionFact(connection, {
      paymentIntentId: id,
      billingMode: "live",
      eventCreated,
      requestedState,
      refundedCents
    });
}

describe.runIf(runIntegration)("Financial Fact writes under concurrency", () => {
  beforeAll(() => {
    adminPool = new Pool({
      connectionString: normalizeDatabaseConnectionString(adminDatabaseUrl),
      max: 3
    });
  });

  afterAll(async () => {
    await adminPool?.end();
  });

  it("US-01.1 ends a duplicate recordFact in the serial result", async () => {
    const raced = `pi_race_${randomUUID()}`;
    const serial = `pi_race_${randomUUID()}`;
    try {
      await concurrently(
        record(raced, "paid", 1000, 0),
        record(raced, "refunded", 1001, 599)
      );
      await serially(
        record(serial, "paid", 1000, 0),
        record(serial, "refunded", 1001, 599)
      );

      const result = await snapshot(raced);
      expect(result.rows).toBe(1);
      expect(result).toEqual(await snapshot(serial));
      expect(result.fact).toMatchObject({ status: "refunded", refunded_cents: 599 });
    } finally {
      await pool().query(
        "DELETE FROM financial_facts WHERE payment_intent_id = ANY($1)",
        [[raced, serial]]
      );
    }
  });

  it("US-02.1 ends a concurrent full refund and dispute in the serial result", async () => {
    const raced = `pi_race_${randomUUID()}`;
    const serial = `pi_race_${randomUUID()}`;
    try {
      for (const id of [raced, serial]) {
        await recordFact(pool(), {
          paymentIntentId: id,
          billingMode: "live",
          eventCreated: 1000,
          status: "paid",
          refundedCents: 0
        });
      }
      await concurrently(
        transition(raced, "refunded", 1001, 599),
        transition(raced, "disputed", 1002, 0)
      );
      await serially(
        transition(serial, "refunded", 1001, 599),
        transition(serial, "disputed", 1002, 0)
      );

      const result = await snapshot(raced);
      expect(result.rows).toBe(1);
      expect(result).toEqual(await snapshot(serial));
      // The dispute arrives after the full refund, so the fact stays refunded.
      expect(result.fact).toMatchObject({
        status: "refunded",
        refunded_cents: 599,
        refunded: true,
        disputed: false
      });
    } finally {
      await pool().query(
        "DELETE FROM financial_facts WHERE payment_intent_id = ANY($1)",
        [[raced, serial]]
      );
    }
  });
});

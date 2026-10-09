#!/usr/bin/env node
// Recovers the Billing Mode of stored Lifetime purchases from Stripe.
//
// A purchase with an empty Billing Mode predates the mode column. Its Checkout
// Session and its PaymentIntent both report the livemode of the money movement.
// Each row is verified against both objects. Dry-run is the default and writes
// nothing. --apply writes a mode only when both objects agree, in one transaction.
// An abandoned Checkout has no PaymentIntent, so its Session alone decides.
// The write also sets the mode on the player_access row that points at the purchase.
//
// One key sees one mode only. A row whose objects the key cannot see is reported
// as missing and stays unchanged. Run again with the key of the other mode.
//
// Exit codes: 0 every row verified, 1 at least one row reported, 2 could not run.
// Any other Stripe or database error writes nothing.
//
// Usage: node scripts/classify-lifetime-purchases.mjs [--apply]

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Pool } from "pg";
import Stripe from "stripe";
import { normalizeDatabaseConnectionString } from "../server/database.js";

/**
 * @typedef {{ id: string, status: string, checkoutSessionId: string | null, paymentIntentId: string | null }} Purchase
 * @typedef {{ id: string, mode: "test" | "live" | null, problem: string | null }} Verification
 */

const PAID_STATUSES = new Set(["paid", "refunded", "disputed"]);

/**
 * Stripe answers resource_missing for an object of the other mode, so one run
 * with one key cannot see every row. The row is reported and the run goes on.
 *
 * @param {() => Promise<any>} retrieve
 */
async function retrieveOrMissing(retrieve) {
  try {
    return await retrieve();
  } catch (error) {
    if (/** @type {{ code?: unknown }} */ (error)?.code === "resource_missing") {
      return null;
    }
    throw error;
  }
}

/** @param {any} session */
function sessionPaymentIntentId(session) {
  const intent = session?.payment_intent;
  return typeof intent === "string" ? intent : (intent?.id ?? null);
}

/**
 * @param {Purchase} purchase
 * @param {{ checkout: { sessions: { retrieve: (id: string) => Promise<any> } }, paymentIntents: { retrieve: (id: string) => Promise<any> } }} stripe
 * @returns {Promise<Verification>}
 */
async function verifyPurchase(purchase, stripe) {
  const unverified = { id: purchase.id, mode: null };
  const paid = PAID_STATUSES.has(purchase.status);
  if (!purchase.checkoutSessionId) {
    return { ...unverified, problem: "missing_session_id" };
  }
  if (!purchase.paymentIntentId && paid) {
    return { ...unverified, problem: "missing_payment_intent_id" };
  }
  const sessionId = purchase.checkoutSessionId;
  const session = await retrieveOrMissing(() => stripe.checkout.sessions.retrieve(sessionId));
  if (typeof session?.livemode !== "boolean") {
    return { ...unverified, problem: "missing_session_object" };
  }
  const mode = session.livemode ? "live" : "test";
  if (!purchase.paymentIntentId) {
    // An abandoned Checkout stores no PaymentIntent. Stripe must agree no money moved.
    return session.payment_status === "paid"
      ? { ...unverified, problem: "paid_without_payment_intent_id" }
      : { id: purchase.id, mode, problem: null };
  }
  const paymentIntentId = purchase.paymentIntentId;
  const paymentIntent = await retrieveOrMissing(() => stripe.paymentIntents.retrieve(paymentIntentId));
  if (typeof paymentIntent?.livemode !== "boolean") {
    return { ...unverified, problem: "missing_payment_intent_object" };
  }
  if (session.livemode !== paymentIntent.livemode) {
    return { ...unverified, problem: "livemode_conflict" };
  }
  const linkedIntent = sessionPaymentIntentId(session);
  if (linkedIntent !== null && linkedIntent !== paymentIntentId) {
    return { ...unverified, problem: "payment_intent_mismatch" };
  }
  return { id: purchase.id, mode, problem: null };
}

/**
 * Verifies every row before the first write. A Stripe error throws here, so
 * the run stops with nothing written.
 *
 * @param {{
 *   store: ReturnType<typeof createPurchaseClassificationStore>,
 *   stripe: Parameters<typeof verifyPurchase>[1],
 *   apply?: boolean,
 *   log?: (line: string) => void
 * }} options
 */
export async function classifyPurchases({ store, stripe, apply = false, log = console.log }) {
  const purchases = await store.listUnclassified();
  const verifications = [];
  for (const purchase of purchases) {
    verifications.push(await verifyPurchase(purchase, stripe));
  }

  const writes = verifications.flatMap((row) =>
    row.problem === null && row.mode !== null ? [{ id: row.id, mode: row.mode }] : []
  );
  if (apply && writes.length > 0) {
    await store.writeBillingModes(writes);
  }

  const results = verifications.map((row) => ({ ...row, written: apply && row.problem === null }));
  for (const row of results) {
    if (row.problem !== null) {
      log(`${row.id} problem=${row.problem} unchanged`);
    } else {
      log(`${row.id} mode=${row.mode} ${apply ? "written" : "dry-run"}`);
    }
  }
  return {
    exitCode: results.some((row) => row.problem !== null) ? 1 : 0,
    results
  };
}

/**
 * The write runs in one transaction. A row that changed since the read fails
 * the batch, so no partial classification survives.
 *
 * @param {{
 *   query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
 *   connect: () => Promise<{
 *     query: (sql: string, values?: unknown[]) => Promise<{ rowCount: number | null, rows: Record<string, unknown>[] }>,
 *     release: (destroy?: boolean) => void
 *   }>
 * }} pool
 */
export function createPurchaseClassificationStore(pool) {
  return {
    /** @returns {Promise<Purchase[]>} */
    async listUnclassified() {
      const result = await pool.query(
        `SELECT id, status, checkout_session_id, payment_intent_id
         FROM lifetime_purchases
         WHERE billing_mode IS NULL
           AND (
             checkout_session_id IS NOT NULL OR
             payment_intent_id IS NOT NULL OR
             status IN ('paid', 'refunded', 'disputed')
           )
         ORDER BY id`
      );
      return result.rows.map((row) => ({
        id: String(row.id),
        status: String(row.status),
        checkoutSessionId: row.checkout_session_id ? String(row.checkout_session_id) : null,
        paymentIntentId: row.payment_intent_id ? String(row.payment_intent_id) : null
      }));
    },

    /** @param {{ id: string, mode: "test" | "live" }[]} updates */
    async writeBillingModes(updates) {
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query("BEGIN");
        for (const update of updates) {
          const result = await client.query(
            `UPDATE lifetime_purchases
             SET billing_mode = $2,
                 updated_at = NOW()
             WHERE id = $1
               AND billing_mode IS NULL`,
            [update.id, update.mode]
          );
          if (result.rowCount !== 1) {
            throw new Error(`Purchase ${update.id} changed during classification.`);
          }
        }
        // A legacy member keeps the state and gains the verified mode, so live reads still see the membership.
        await client.query(
          `UPDATE player_access
           SET membership_mode = p.billing_mode,
               updated_at = NOW()
           FROM lifetime_purchases p
           WHERE player_access.active_purchase_id = p.id
             AND p.id = ANY($1::uuid[])
             AND player_access.membership_mode IS NULL`,
          [updates.map((update) => update.id)]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
          discard = true;
        });
        throw error;
      } finally {
        client.release(discard);
      }
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) {
    console.error("Usage: node scripts/classify-lifetime-purchases.mjs [--apply]");
    process.exitCode = 2;
    return;
  }
  const apply = args.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!connectionString || !secretKey) {
    console.error("DATABASE_URL and STRIPE_SECRET_KEY are required to classify purchases.");
    process.exitCode = 2;
    return;
  }

  /** @type {Pool | null} */
  let pool = null;
  try {
    // Constructed inside the handler so a malformed URL exits 2, not 1.
    pool = new Pool({
      connectionString: normalizeDatabaseConnectionString(connectionString),
      max: 1,
      connectionTimeoutMillis: 10000,
      query_timeout: 60000
    });
    const { exitCode } = await classifyPurchases({
      store: createPurchaseClassificationStore(pool),
      stripe: new Stripe(secretKey),
      apply
    });
    console.log(
      apply
        ? "APPLY finished. Verified rows are written."
        : "DRY-RUN finished. Nothing written. Run with --apply to write verified rows."
    );
    if (exitCode !== 0) {
      console.error("FAIL reported rows stay unchanged. Resolve them in Stripe or the database, then run again.");
      process.exitCode = 1;
    }
  } catch (error) {
    // Name or type only: a Stripe message can echo the key prefix.
    const failure = /** @type {{ type?: unknown, name?: unknown }} */ (error);
    const kind = typeof failure?.type === "string" ? failure.type : String(failure?.name ?? "Error");
    console.error(`ERROR classification stopped (${kind}). Nothing was written.`);
    process.exitCode = 2;
  } finally {
    await pool?.end();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  await main();
}

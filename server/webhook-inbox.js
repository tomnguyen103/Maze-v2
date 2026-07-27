import { safeErrorName } from "./safe-error-log.js";

/** Past this many attempts a row is dead and stops consuming retry budget. */
export const MAX_WEBHOOK_ATTEMPTS = 5;

/**
 * @typedef {{
 *   provider: "stripe" | "clerk",
 *   eventId: string,
 *   eventType: string,
 *   payload: unknown
 * }} WebhookDelivery
 */

/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} pool
 */
export function createWebhookInboxStore(pool) {
  return {
    /**
     * Records a delivery. A repeat of the same (provider, event_id) collides on
     * the primary key and returns `duplicate`, which is what makes provider
     * replay safe without consulting anything else.
     *
     * @param {WebhookDelivery} delivery
     */
    async record({ provider, eventId, eventType, payload }) {
      const result = await pool.query(
        `INSERT INTO webhook_inbox (provider, event_id, event_type, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider, event_id) DO NOTHING
         RETURNING status`,
        [provider, eventId, eventType, JSON.stringify(payload ?? null)]
      );
      return { duplicate: result.rows.length === 0 };
    },

    /**
     * @param {{ provider: string, eventId: string }} key
     */
    async markProcessed({ provider, eventId }) {
      await pool.query(
        `UPDATE webhook_inbox
         SET status = 'processed',
             processed_at = now(),
             attempts = attempts + 1,
             last_error = NULL
         WHERE provider = $1 AND event_id = $2`,
        [provider, eventId]
      );
    },

    /**
     * Failure past the attempt cap becomes `dead`: it has stopped being a
     * transient problem and must not consume retry budget forever.
     *
     * @param {{ provider: string, eventId: string, error: unknown }} failure
     */
    async markFailed({ provider, eventId, error }) {
      const result = await pool.query(
        `UPDATE webhook_inbox
         SET attempts = attempts + 1,
             status = CASE
               WHEN attempts + 1 >= $3 THEN 'dead'
               ELSE 'failed'
             END,
             last_error = $4
         WHERE provider = $1 AND event_id = $2
         RETURNING status, attempts`,
        [provider, eventId, MAX_WEBHOOK_ATTEMPTS, safeErrorName(error)]
      );
      const row = result.rows[0] ?? {};
      return {
        status: String(row.status ?? "failed"),
        attempts: Number(row.attempts ?? 0)
      };
    },

    /**
     * Reads the rows still owed work. Deliberately NOT a lock-based claim: this
     * runs through the pooled adapter in autocommit, where `FOR UPDATE` would
     * release at statement end and guarantee nothing. Two overlapping runs can
     * therefore pick the same row, which is safe because `processEvent` is
     * idempotent per provider — Stripe through `stripe_webhook_events`, Clerk
     * through the deletion tombstone. That idempotency is the real guarantee,
     * not the lock.
     *
     * @param {{ limit?: number }} [options]
     */
    async selectRetryable({ limit = 20 } = {}) {
      const result = await pool.query(
        `SELECT provider, event_id, event_type, payload, attempts
         FROM webhook_inbox
         WHERE status IN ('pending', 'failed')
           AND attempts < $2
         ORDER BY received_at ASC
         LIMIT $1`,
        [limit, MAX_WEBHOOK_ATTEMPTS]
      );
      return result.rows;
    },

    /**
     * @param {{ limit?: number }} [options]
     */
    async listDead({ limit = 100 } = {}) {
      const result = await pool.query(
        `SELECT provider, event_id, event_type, attempts, last_error, received_at
         FROM webhook_inbox
         WHERE status = 'dead'
         ORDER BY received_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    }
  };
}

/**
 * The seam both the inline path and the retry loop share. Storing first and
 * processing second means a crash between the two leaves a retryable row rather
 * than a lost event.
 *
 * @param {{
 *   store: ReturnType<typeof createWebhookInboxStore>,
 *   processEvent: (
 *     provider: string,
 *     event: { eventType: string, payload: unknown }
 *   ) => Promise<void>,
 *   onFailure?: (details: {
 *     provider: string,
 *     eventType: string,
 *     status: string,
 *     attempts: number,
 *     name: string
 *   }) => void
 * }} dependencies
 */
export function createWebhookInbox({
  store,
  processEvent,
  onFailure = (details) => console.error("[webhook] processing failed", details)
}) {
  /**
   * @param {string} provider
   * @param {{ eventId: string, eventType: string, payload: unknown }} event
   */
  async function process(provider, event) {
    try {
      await processEvent(provider, {
        eventType: event.eventType,
        payload: event.payload
      });
    } catch (error) {
      /** @type {{ status: string, attempts: number }} */
      let outcome;
      try {
        outcome = await store.markFailed({
          provider,
          eventId: event.eventId,
          error
        });
      } catch (bookkeepingError) {
        // The delivery is already stored, so it stays retryable. Reporting a
        // failure to the provider here would ask it to redeliver something we
        // already own.
        onFailure({
          provider,
          eventType: event.eventType,
          status: "failed",
          attempts: 0,
          name: safeErrorName(bookkeepingError)
        });
        return { processed: false, status: "failed", attempts: 0 };
      }
      onFailure({
        provider,
        eventType: event.eventType,
        status: outcome.status,
        attempts: outcome.attempts,
        name: safeErrorName(error)
      });
      return { processed: false, ...outcome };
    }
    try {
      await store.markProcessed({ provider, eventId: event.eventId });
    } catch (error) {
      // Processing succeeded. A failed status write leaves the row retryable,
      // and a retry is a no-op because processEvent is idempotent.
      onFailure({
        provider,
        eventType: event.eventType,
        status: "processed",
        attempts: 0,
        name: safeErrorName(error)
      });
    }
    return { processed: true, status: "processed" };
  }

  return {
    /**
     * @param {WebhookDelivery} delivery
     */
    async receive(delivery) {
      const { duplicate } = await store.record(delivery);
      if (duplicate) {
        // Already stored, so it is already owned by the inbox — processed,
        // in flight, or waiting for retry. Doing anything else here is how a
        // replay turns into a second state change.
        return { duplicate: true, processed: false };
      }
      const outcome = await process(delivery.provider, delivery);
      return { duplicate: false, ...outcome };
    },

    /**
     * @param {{ limit?: number }} [options]
     */
    async retryPending({ limit = 20 } = {}) {
      const rows = await store.selectRetryable({ limit });
      let processed = 0;
      let failed = 0;
      let dead = 0;
      for (const row of rows) {
        const outcome = await process(String(row.provider), {
          eventId: String(row.event_id),
          eventType: String(row.event_type),
          payload: row.payload
        });
        if (outcome.processed) {
          processed += 1;
        } else if (outcome.status === "dead") {
          dead += 1;
        } else {
          failed += 1;
        }
      }
      return { claimed: rows.length, processed, failed, dead };
    }
  };
}

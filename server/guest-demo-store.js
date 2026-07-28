import { createHash } from "node:crypto";

const ADDRESS_HASH_PATTERN = /^[a-f0-9]{64}$/;
const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{12,128}$/;

/**
 * One daily counter per privacy-preserving address hash plus one opaque
 * admitted-Run marker per Run id. The bucket row is locked for the transaction,
 * so two first Runs arriving together cannot both consume the single allowance.
 *
 * Marker count 1 means admitted. Blocked Run ids create no durable row because
 * the spent bucket already reproduces their denial; this prevents write spam.
 *
 * @param {{
 *   connect: () => Promise<{
 *     query: (
 *       sql: string,
 *       values?: unknown[]
 *     ) => Promise<{ rows: Record<string, unknown>[] }>,
 *     release: () => void
 *   }>
 * }} pool
 * @param {{ today?: () => string }} [options]
 */
export function createGuestDemoStore(
  pool,
  { today = () => new Date().toISOString().slice(0, 10) } = {}
) {
  return {
    /**
     * @param {string} addressHash
     * @param {{
     *   runId: string,
     *   seed: string,
     *   levelId: string,
     *   labyrinthNumber: number
     * }} run
     */
    async authorizeGuestRun(addressHash, run) {
      if (!ADDRESS_HASH_PATTERN.test(addressHash)) {
        throw new Error("Guest address hash is invalid.");
      }
      if (!RUN_ID_PATTERN.test(run.runId)) {
        throw new Error("Guest Run id is invalid.");
      }
      const date = today();
      const windowStart = `${date}T00:00:00.000Z`;
      const bucketKey = `guest-demo:${addressHash}`;
      const markerKey = `guest-run:${createHash("sha256")
        .update(
          JSON.stringify([
            addressHash,
            run.runId,
            run.seed,
            run.levelId,
            run.labyrinthNumber
          ])
        )
        .digest("hex")}`;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO rate_limit_counters (
             key, window_start, count, updated_at
           ) VALUES ($1, $2, 0, now())
           ON CONFLICT (key) DO NOTHING`,
          [bucketKey, windowStart]
        );
        const bucket = await client.query(
          `SELECT window_start, count
           FROM rate_limit_counters
           WHERE key = $1
           FOR UPDATE`,
          [bucketKey]
        );
        const reset = await client.query(
          `UPDATE rate_limit_counters
           SET window_start = $2, count = 0, updated_at = now()
           WHERE key = $1 AND window_start < $2
           RETURNING count`,
          [bucketKey, windowStart]
        );
        const marker = await client.query(
          `SELECT count
           FROM rate_limit_counters
           WHERE key = $1 AND window_start = $2`,
          [markerKey, windowStart]
        );
        if (marker.rows[0]) {
          const allowed = Number(marker.rows[0].count) === 1;
          await client.query("COMMIT");
          return decision(allowed, true);
        }
        const allowed =
          Number(reset.rows[0]?.count ?? bucket.rows[0]?.count ?? 0) < 1;
        if (allowed) {
          await client.query(
            `UPDATE rate_limit_counters
             SET count = count + 1, updated_at = now()
             WHERE key = $1`,
            [bucketKey]
          );
        }
        if (allowed) {
          await client.query(
            `INSERT INTO rate_limit_counters (
               key, window_start, count, updated_at
             ) VALUES ($1, $2, 1, now())`,
            [markerKey, windowStart]
          );
        }
        await client.query("COMMIT");
        return decision(allowed, false);
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original database failure.
        }
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

/** @param {boolean} allowed @param {boolean} duplicate */
function decision(allowed, duplicate) {
  return {
    allowed,
    duplicate,
    freeRunsRemaining: 0,
    state: "guest-demo"
  };
}

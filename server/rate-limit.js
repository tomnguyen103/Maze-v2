import {
  RATE_LIMIT_BUDGETS,
  UNMETERED
} from "./rate-limit-config.js";
import { safeErrorName } from "./safe-error-log.js";

export { RATE_LIMIT_BUDGETS, UNMETERED };

/** @typedef {import("./rate-limit-config.js").RateLimitBudget} RateLimitBudget */

/**
 * Start of the fixed window containing `timestamp`, as an ISO string so it is
 * both the SQL parameter and the identity the upsert compares on.
 *
 * @param {number} timestamp
 * @param {number} windowMs
 */
export function windowStartFor(timestamp, windowMs) {
  return new Date(Math.floor(timestamp / windowMs) * windowMs).toISOString();
}

/**
 * Signed-in callers are metered per account. Guests are metered per address
 * hash — never a raw address, matching the audit log's privacy posture.
 *
 * @param {string} budget
 * @param {{ userId?: string | null, addressHash?: string | null }} caller
 */
export function rateLimitKey(budget, { userId = null, addressHash = null }) {
  if (userId) {
    return `${budget}:user:${userId}`;
  }
  if (addressHash) {
    return `${budget}:ip:${addressHash}`;
  }
  return null;
}

/**
 * @param {{
 *   store: {
 *     increment: (
 *       key: string,
 *       windowStart: string
 *     ) => Promise<{ count: number, windowStart: string }>
 *   },
 *   now?: () => number,
 *   onLimited?: (details: { budget: string, scope: "user" | "ip" }) => void,
 *   onFailure?: (details: { budget: string, name: string }) => void
 * }} dependencies
 */
export function createRateLimiter({
  store,
  now = () => Date.now(),
  onLimited = () => {},
  onFailure = (details) => console.warn("[rate-limit] counter unavailable", details)
}) {
  return {
    /**
     * @param {RateLimitBudget} budgetName
     * @param {{ userId?: string | null, addressHash?: string | null }} caller
     */
    async consume(budgetName, caller) {
      const budget = RATE_LIMIT_BUDGETS[budgetName];
      if (!budget) {
        throw new Error(`Unknown rate limit budget: ${budgetName}`);
      }
      const key = rateLimitKey(budgetName, caller);
      if (!key) {
        // One shared bucket for every unidentifiable caller would let a single
        // abuser lock out everyone else, which is worse than not metering.
        return { ...UNMETERED, limit: budget.limit, remaining: budget.limit };
      }
      const requestedAt = now();
      let count;
      let windowStart;
      try {
        ({ count, windowStart } = await store.increment(
          key,
          windowStartFor(requestedAt, budget.windowMs)
        ));
      } catch (error) {
        // Rate limiting must never take down play. Admit and say so.
        onFailure({ budget: budgetName, name: safeErrorName(error) });
        return { ...UNMETERED, limit: budget.limit, remaining: budget.limit };
      }
      const allowed = count <= budget.limit;
      if (!allowed) {
        onLimited({
          budget: budgetName,
          scope: caller.userId ? "user" : "ip"
        });
      }
      // Derived from the window the row actually settled on, not the one this
      // request computed, so a request delayed across a boundary still reports
      // the real time until reset.
      const windowEnds = Date.parse(windowStart) + budget.windowMs;
      return {
        allowed,
        degraded: false,
        limit: budget.limit,
        remaining: Math.max(0, budget.limit - count),
        retryAfterSeconds: allowed
          ? 0
          : Math.max(1, Math.ceil((windowEnds - now()) / 1000))
      };
    }
  };
}

/**
 * Postgres-backed counter. The upsert is one statement, so concurrent requests
 * in the same window each increment exactly once without a transaction.
 *
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} pool
 */
export function createRateLimitStore(pool) {
  return {
    /**
     * The count resets only when the stored window is strictly OLDER than the
     * incoming one, and `window_start` never moves backwards. A request delayed
     * across a boundary — pool saturation, container clock skew — would
     * otherwise rewind a fresh window to 1 and hand out a free budget.
     *
     * @param {string} key
     * @param {string} windowStart
     */
    async increment(key, windowStart) {
      const result = await pool.query(
        `INSERT INTO rate_limit_counters (key, window_start, count)
         VALUES ($1, $2, 1)
         ON CONFLICT (key) DO UPDATE
           SET count = CASE
                 WHEN rate_limit_counters.window_start < EXCLUDED.window_start
                   THEN 1
                 ELSE rate_limit_counters.count + 1
               END,
               window_start = GREATEST(
                 rate_limit_counters.window_start,
                 EXCLUDED.window_start
               ),
               updated_at = now()
         RETURNING count, window_start`,
        [key, windowStart]
      );
      const row = result.rows[0] ?? {};
      const settled = row.window_start;
      return {
        count: Number(row.count ?? 1),
        windowStart:
          settled instanceof Date
            ? settled.toISOString()
            : String(settled ?? windowStart)
      };
    },

    /**
     * Guest buckets are keyed by a daily-rotating address hash, so old rows
     * stop being reachable and only take up space. Run from
     * `npm run prune:rate-limits`.
     *
     * @param {{ olderThanMs?: number }} [options]
     */
    async prune({ olderThanMs = 24 * 60 * 60 * 1000 } = {}) {
      const result = await pool.query(
        `DELETE FROM rate_limit_counters
         WHERE window_start < now() - ($1::bigint * interval '1 millisecond')
         RETURNING key`,
        [olderThanMs]
      );
      return result.rows.length;
    }
  };
}

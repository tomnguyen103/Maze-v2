import { safeErrorName } from "./safe-error-log.js";

/**
 * Per-budget allowances. Generous on purpose: these protect the database and
 * the question provider from abuse, and normal play must never reach them. The
 * e2e suite is what proves that second half.
 *
 * `export.self` is consumed by the phase 6 data-export endpoint.
 */
export const RATE_LIMIT_BUDGETS = {
  "question.fetch": { limit: 30, windowMs: 60_000 },
  "score.submit": { limit: 10, windowMs: 60_000 },
  "lifetime.checkout": { limit: 5, windowMs: 60_000 },
  "profile.write": { limit: 10, windowMs: 60_000 },
  "export.self": { limit: 2, windowMs: 3_600_000 }
};

/** @typedef {keyof typeof RATE_LIMIT_BUDGETS} RateLimitBudget */

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
        return {
          allowed: true,
          degraded: true,
          limit: budget.limit,
          remaining: budget.limit,
          retryAfterSeconds: 0
        };
      }
      const timestamp = now();
      const windowStart = windowStartFor(timestamp, budget.windowMs);
      let count;
      try {
        ({ count } = await store.increment(key, windowStart));
      } catch (error) {
        // Rate limiting must never take down play. Admit and say so.
        onFailure({ budget: budgetName, name: safeErrorName(error) });
        return {
          allowed: true,
          degraded: true,
          limit: budget.limit,
          remaining: budget.limit,
          retryAfterSeconds: 0
        };
      }
      const allowed = count <= budget.limit;
      if (!allowed) {
        onLimited({
          budget: budgetName,
          scope: caller.userId ? "user" : "ip"
        });
      }
      const windowEnds = Date.parse(windowStart) + budget.windowMs;
      return {
        allowed,
        degraded: false,
        limit: budget.limit,
        remaining: Math.max(0, budget.limit - count),
        retryAfterSeconds: allowed
          ? 0
          : Math.max(1, Math.ceil((windowEnds - timestamp) / 1000))
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
     * @param {string} key
     * @param {string} windowStart
     */
    async increment(key, windowStart) {
      const result = await pool.query(
        `INSERT INTO rate_limit_counters (key, window_start, count)
         VALUES ($1, $2, 1)
         ON CONFLICT (key) DO UPDATE
           SET count = CASE
                 WHEN rate_limit_counters.window_start = EXCLUDED.window_start
                   THEN rate_limit_counters.count + 1
                 ELSE 1
               END,
               window_start = EXCLUDED.window_start,
               updated_at = now()
         RETURNING count, window_start`,
        [key, windowStart]
      );
      const row = result.rows[0] ?? {};
      return {
        count: Number(row.count ?? 1),
        windowStart: String(row.window_start ?? windowStart)
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

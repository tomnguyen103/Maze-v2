/**
 * Per-budget allowances. Generous on purpose: these protect the database and the
 * question provider from abuse, and normal play must never reach them. The e2e
 * suite is what proves that second half.
 *
 * Windows are fixed, so a full budget can be spent instantly at the start of a
 * window and up to two budgets' worth can cross a boundary. That burst is the
 * accepted behaviour, not an oversight — see
 * `docs/adr/0014-serverless-rate-limits-and-strict-headers.md`.
 *
 * `export.self` is consumed by the phase 6 data-export endpoint.
 */
export const RATE_LIMIT_BUDGETS = {
  "guest-run.start": { limit: 20, windowMs: 60_000 },
  "question.fetch": { limit: 30, windowMs: 60_000 },
  "score.submit": { limit: 10, windowMs: 60_000 },
  "lifetime.checkout": { limit: 5, windowMs: 60_000 },
  "profile.write": { limit: 10, windowMs: 60_000 },
  "export.self": { limit: 2, windowMs: 3_600_000 },
  "classroom.create": { limit: 3, windowMs: 3_600_000 },
  "classroom.domain": { limit: 5, windowMs: 3_600_000 },
  "classroom.invite": { limit: 20, windowMs: 3_600_000 }
};

/** @typedef {keyof typeof RATE_LIMIT_BUDGETS} RateLimitBudget */

export const RATE_LIMIT_BUDGET_NAMES = /** @type {RateLimitBudget[]} */ (
  Object.keys(RATE_LIMIT_BUDGETS).sort()
);

/**
 * Returned whenever no honest decision can be made: no counter store, no
 * identifiable caller, or an unreachable store. Always admits — rate limiting is
 * protective, and refusing play because the limiter is unavailable is worse than
 * not metering.
 *
 * @type {{
 *   allowed: true,
 *   degraded: true,
 *   limit: number,
 *   remaining: number,
 *   retryAfterSeconds: number
 * }}
 */
export const UNMETERED = Object.freeze({
  allowed: true,
  degraded: true,
  limit: 0,
  remaining: 0,
  retryAfterSeconds: 0
});

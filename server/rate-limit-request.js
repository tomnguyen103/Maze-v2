import { getDatabasePool } from "./database.js";
import { recordProductEvent } from "./product-events.js";
import {
  createRateLimiter,
  createRateLimitStore
} from "./rate-limit.js";
import { createAddressHasher } from "./request-identity.js";

/**
 * @typedef {{
 *   allowed: boolean,
 *   degraded: boolean,
 *   limit: number,
 *   remaining: number,
 *   retryAfterSeconds: number
 * }} RateLimitDecision
 *
 * @typedef {(
 *   budget: import("./rate-limit.js").RateLimitBudget,
 *   request: import("node:http").IncomingMessage,
 *   userId?: string | null
 * ) => Promise<RateLimitDecision>} RateLimit
 */

/**
 * Decision returned when no counter store is configured, or when the caller
 * cannot be identified. Both admit the request: rate limiting is protective,
 * and refusing play because the limiter is unavailable is the worse failure.
 *
 * @type {RateLimitDecision}
 */
const ADMITTED = {
  allowed: true,
  degraded: true,
  limit: 0,
  remaining: 0,
  retryAfterSeconds: 0
};

/**
 * Builds the `rateLimit(budget, request, userId)` function that route handlers
 * receive. Route handlers stay unaware of the pool, the address salt, and the
 * proxy-trust policy.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function createRequestRateLimiter(env = process.env) {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    // Guest play works without a database; so must the limiter.
    return async () => ADMITTED;
  }
  const pool = getDatabasePool(connectionString);
  const limiter = createRateLimiter({
    store: createRateLimitStore({
      /**
       * @param {string} sql
       * @param {unknown[]} [values]
       */
      async query(sql, values) {
        const result = await pool.query(sql, values);
        return {
          rows: /** @type {Record<string, unknown>[]} */ (result.rows)
        };
      }
    }),
    onLimited: (details) => recordProductEvent("rate_limit_hit", details)
  });
  const addressHashFor = createAddressHasher({
    salt: env.REQUEST_ADDRESS_SALT ?? "",
    trustProxy: env.TRUST_PROXY_HEADERS === "true"
  });

  /** @type {RateLimit} */
  return async function rateLimit(budget, request, userId = null) {
    return limiter.consume(budget, {
      userId,
      addressHash: userId ? null : addressHashFor(request)
    });
  };
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {{ retryAfterSeconds: number, limit: number }} decision
 * @param {string} message
 */
export function sendRateLimited(response, decision, message) {
  response.statusCode = 429;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("retry-after", String(decision.retryAfterSeconds));
  response.end(
    JSON.stringify({ error: message, retryAfter: decision.retryAfterSeconds })
  );
}

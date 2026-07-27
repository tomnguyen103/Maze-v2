import { createQueryAdapter, getDatabasePool } from "./database.js";
import { recordProductEvent } from "./product-events.js";
import { UNMETERED } from "./rate-limit-config.js";
import {
  createRateLimiter,
  createRateLimitStore
} from "./rate-limit.js";
import {
  createAddressHasher,
  resolveAddressSalt,
  trustsProxyHeaders
} from "./request-identity.js";

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
 *   budget: import("./rate-limit-config.js").RateLimitBudget,
 *   request: import("node:http").IncomingMessage,
 *   userId?: string | null
 * ) => Promise<RateLimitDecision>} RateLimit
 */

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
    return async () => UNMETERED;
  }
  const limiter = createRateLimiter({
    store: createRateLimitStore(
      createQueryAdapter(getDatabasePool(connectionString))
    ),
    onLimited: (details) => recordProductEvent("rate_limit_hit", details)
  });
  const addressHashFor = createAddressHasher({
    salt: resolveAddressSalt(env),
    trustProxy: trustsProxyHeaders(env)
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
 * @param {{ retryAfterSeconds: number }} decision
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

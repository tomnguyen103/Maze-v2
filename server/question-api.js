import { clerkMiddleware, getAuth } from "@clerk/express";
import { createQueryAdapter, getDatabasePool } from "./database.js";
import { createQuestionBankStore } from "./question-bank-store.js";
import { createQuestionHandler } from "./question-route.js";
import { createQuestionService } from "./question-service.js";
import { createRequestRateLimiter } from "./rate-limit-request.js";
import {
  logProviderFallback,
  safeErrorName
} from "./safe-error-log.js";

/**
 * The `/api/question` composition root, alongside `createPlayerApi`: env
 * reading and pool construction belong here rather than in the serverless
 * entry, so both are injectable and testable.
 *
 * Without a database the bundled bank is the whole bank — the state every
 * deployment starts in, and the state an outage falls back to.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{
 *   authenticate?: (
 *     request: import("node:http").IncomingMessage,
 *     response: import("node:http").ServerResponse,
 *     next: (error?: unknown) => void
 *   ) => void,
 *   getUserId?: (
 *     request: import("node:http").IncomingMessage
 *   ) => string | null,
 *   rateLimit?: import("./rate-limit-request.js").RateLimit
 * }} [dependencies]
 */
export function createQuestionApi(env = process.env, dependencies = {}) {
  const connectionString = env.DATABASE_URL;
  const questionBank = connectionString
    ? createQuestionBankStore(
        createQueryAdapter(getDatabasePool(connectionString))
      )
    : null;
  const clerkConfigured = Boolean(
    env.CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY
  );
  const authenticate =
    dependencies.authenticate ??
    (clerkConfigured
      ? clerkMiddleware({
          publishableKey: env.CLERK_PUBLISHABLE_KEY,
          secretKey: env.CLERK_SECRET_KEY
        })
      : null);
  const getUserId =
    dependencies.getUserId ??
    (authenticate ? optionalUserId : () => null);
  const handler = createQuestionHandler(
    createQuestionService({
      env: /** @type {NodeJS.ProcessEnv} */ (env),
      questionBank,
      onProviderError: logProviderFallback,
      onQuestionBankError: (error) =>
        console.error("[question] published bank read failed", {
          name: safeErrorName(error)
        })
    }),
    {
      getUserId,
      rateLimit:
        dependencies.rateLimit ?? createRequestRateLimiter(env)
    }
  );
  if (!authenticate) {
    return handler;
  }

  /**
   * Optional authentication never turns Questions into a protected route.
   * Missing or invalid Clerk state falls back to the existing Guest address
   * budget; a verified session only changes the limiter key.
   *
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return function questionApi(request, response, next = undefined) {
    authenticate(
      /** @type {import("express").Request} */ (request),
      /** @type {import("express").Response} */ (response),
      () => {
        void handler(request, response, next);
      }
    );
  };
}

/** @param {import("node:http").IncomingMessage} request */
function optionalUserId(request) {
  try {
    return getAuth(
      /** @type {import("express").Request} */ (request)
    ).userId;
  } catch {
    return null;
  }
}

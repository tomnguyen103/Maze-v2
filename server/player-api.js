import { clerkMiddleware, getAuth } from "@clerk/express";
import Stripe from "stripe";
import { createDatabasePool } from "./database.js";
import { loadLifetimeConfig } from "./lifetime-config.js";
import {
  createLifetimeHandler,
  LIFETIME_PATHS
} from "./lifetime-route.js";
import { createLifetimeService } from "./lifetime-service.js";
import { createLifetimeStore } from "./lifetime-store.js";
import { createPlayerApiHandler } from "./player-route.js";
import { createPlayerStore } from "./player-store.js";
import {
  ACCESS_PATHS,
  createRunAccessHandler
} from "./run-access-route.js";
import { createRunAccessStore } from "./run-access-store.js";
import { recordProductEvent } from "./product-events.js";
import { createStripeLifetimeProvider } from "./stripe-lifetime.js";
import { URL } from "node:url";

const PLAYER_PATHS = new Set([
  "/api/profile",
  "/api/leaderboard",
  "/api/scores",
  ...ACCESS_PATHS,
  ...LIFETIME_PATHS
]);

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {string} error
 */
function sendError(response, status, error) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({ error }));
}

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env */
export function createPlayerApi(env = process.env) {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    /**
     * @param {import("node:http").IncomingMessage} request
     * @param {import("node:http").ServerResponse} response
     * @param {(() => void) | undefined} next
     */
    return function unavailablePlayerApi(request, response, next = undefined) {
      const pathname = new URL(request.url ?? "", "http://local").pathname;
      if (!PLAYER_PATHS.has(pathname)) {
        next?.();
        return;
      }
      if (pathname === "/api/access/config" && request.method === "GET") {
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.end(JSON.stringify({ enforcementEnabled: false }));
        return;
      }
      if (pathname === "/api/leaderboard" && request.method === "GET") {
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.end(JSON.stringify({ entries: [], globalMaxScore: 0 }));
        return;
      }
      sendError(
        response,
        503,
        "Player services are not configured. Guest play still works."
      );
    };
  }

  const pool = createDatabasePool(connectionString);
  /** @type {{
   *   query: (
   *     sql: string,
   *     values?: unknown[]
   *   ) => Promise<{ rows: Record<string, unknown>[] }>
   * }} */
  const queryAdapter = {
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
  };
  const store = createPlayerStore(queryAdapter);
  const accessStore = createRunAccessStore(pool);
  const lifetimeStore = createLifetimeStore(pool);
  const lifetimeConfig = loadLifetimeConfig(env);
  const getUserId = (
    /** @type {import("node:http").IncomingMessage} */ request
  ) => getAuth(
    /** @type {import("express").Request} */ (request)
  ).userId;
  const handler = createPlayerApiHandler({
    store,
    getUserId
  });
  const lifetimeHandler = createLifetimeHandler({
    getUserId,
    service: lifetimeConfig
      ? createLifetimeService({
          config: lifetimeConfig,
          provider: createStripeLifetimeProvider({
            appOrigin: lifetimeConfig.appOrigin,
            priceId: lifetimeConfig.priceId,
            stripe: new Stripe(lifetimeConfig.secretKey),
            webhookSecret: lifetimeConfig.webhookSecret
          }),
          recordEvent: recordProductEvent,
          store: lifetimeStore
        })
      : unavailableLifetimeService()
  });
  const accessHandler = createRunAccessHandler({
    store: accessStore,
    getUserId,
    enforcementEnabled:
      env.RUN_ACCESS_ENFORCEMENT_ENABLED === "true" &&
      lifetimeConfig !== null,
    recordEvent: recordProductEvent
  });

  if (!env.CLERK_PUBLISHABLE_KEY || !env.CLERK_SECRET_KEY) {
    const unavailableAuthHandler = createPlayerApiHandler({
      store,
      getUserId: () => null
    });
    const unavailableAccessHandler = createRunAccessHandler({
      store: accessStore,
      getUserId: () => null,
      enforcementEnabled: false
    });
    const unavailableLifetimeHandler = createLifetimeHandler({
      getUserId: () => null,
      service: lifetimeConfig
        ? createLifetimeService({
            config: lifetimeConfig,
            provider: createStripeLifetimeProvider({
              appOrigin: lifetimeConfig.appOrigin,
              priceId: lifetimeConfig.priceId,
              stripe: new Stripe(lifetimeConfig.secretKey),
              webhookSecret: lifetimeConfig.webhookSecret
            }),
            recordEvent: recordProductEvent,
            store: lifetimeStore
          })
        : unavailableLifetimeService()
    });
    /**
     * @param {import("node:http").IncomingMessage} request
     * @param {import("node:http").ServerResponse} response
     * @param {(() => void) | undefined} next
     */
    return (request, response, next) => {
      const pathname = new URL(request.url ?? "", "http://local").pathname;
      if (pathname === "/api/stripe-webhook") {
        void unavailableLifetimeHandler(request, response, next);
        return;
      }
      if (ACCESS_PATHS.has(pathname)) {
        void unavailableAccessHandler(request, response, next);
        return;
      }
      if (LIFETIME_PATHS.has(pathname)) {
        void unavailableLifetimeHandler(request, response, next);
        return;
      }
      void unavailableAuthHandler(request, response, next);
    };
  }

  const authenticate = clerkMiddleware({
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY
  });

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} next
   */
  return function playerApi(request, response, next = undefined) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!PLAYER_PATHS.has(pathname)) {
      next?.();
      return;
    }
    if (pathname === "/api/stripe-webhook") {
      void lifetimeHandler(request, response, next);
      return;
    }
    if (
      pathname === "/api/leaderboard" ||
      pathname === "/api/access/config"
    ) {
      if (pathname === "/api/access/config") {
        void accessHandler(request, response, next);
        return;
      }
      void handler(request, response, next);
      return;
    }
    authenticate(
      /** @type {import("express").Request} */ (request),
      /** @type {import("express").Response} */ (response),
      (/** @type {unknown} */ error) => {
        if (error) {
          sendError(response, 401, "Sign in to continue.");
          return;
        }
        if (ACCESS_PATHS.has(pathname)) {
          void accessHandler(request, response, next);
          return;
        }
        if (LIFETIME_PATHS.has(pathname)) {
          void lifetimeHandler(request, response, next);
          return;
        }
        void handler(request, response, next);
      }
    );
  };
}

function unavailableLifetimeService() {
  const unavailable = async () => {
    throw new Error("Lifetime Membership is not configured.");
  };
  return {
    confirmCheckout: unavailable,
    createCheckout: unavailable,
    processWebhook: unavailable
  };
}

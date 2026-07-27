import { clerkMiddleware, getAuth } from "@clerk/express";
import Stripe from "stripe";
import {
  CLERK_WEBHOOK_PATH,
  createClerkWebhookHandler
} from "./clerk-webhook-route.js";
import { createAuditStore } from "./audit-store.js";
import { createAuditRecorder, createRequestAuditor } from "./audit.js";
import { getDatabasePool } from "./database.js";
import { createRequestRateLimiter } from "./rate-limit-request.js";
import { loadLifetimeConfig } from "./lifetime-config.js";
import {
  createLifetimeHandler,
  LIFETIME_PATHS
} from "./lifetime-route.js";
import { createLifetimeService } from "./lifetime-service.js";
import { createLifetimeStore } from "./lifetime-store.js";
import {
  createLearningJournalHandler,
  LEARNING_JOURNAL_PATH
} from "./learning-journal-route.js";
import { createLearningJournalStore } from "./learning-journal-store.js";
import { createPlayerApiHandler } from "./player-route.js";
import { createPlayerStore } from "./player-store.js";
import {
  createQuestProgressHandler,
  QUEST_PROGRESS_PATHS
} from "./quest-progress-route.js";
import { createQuestProgressStore } from "./quest-progress-store.js";
import {
  ACCESS_PATHS,
  createRunAccessHandler
} from "./run-access-route.js";
import { createRunAccessStore } from "./run-access-store.js";
import { recordProductEvent } from "./product-events.js";
import { createStripeLifetimeProvider } from "./stripe-lifetime.js";
import { createUserDeletionStore } from "./user-deletion-store.js";
import { URL } from "node:url";

const PLAYER_PATHS = new Set([
  "/api/profile",
  "/api/leaderboard",
  "/api/scores",
  LEARNING_JOURNAL_PATH,
  ...QUEST_PROGRESS_PATHS,
  ...ACCESS_PATHS,
  ...LIFETIME_PATHS,
  CLERK_WEBHOOK_PATH
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

  const pool = getDatabasePool(connectionString);
  const rateLimit = createRequestRateLimiter(env);
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
  const learningJournalStore = createLearningJournalStore(queryAdapter);
  const questProgressStore = createQuestProgressStore(queryAdapter);
  const userDeletionStore = createUserDeletionStore(pool);
  const auditIpSalt = env.AUDIT_IP_SALT ?? "";
  if (!auditIpSalt) {
    // Audit rows are still written and the chain is still valid; only the
    // address hash is dropped. Say so once so it is never a silent surprise.
    console.warn(
      "[audit] AUDIT_IP_SALT is unset; audit rows will store no address hash."
    );
  }
  const recordAudit = createRequestAuditor({
    recorder: createAuditRecorder({ store: createAuditStore(pool) }),
    salt: auditIpSalt,
    trustProxy: env.AUDIT_TRUST_PROXY === "true"
  });
  const lifetimeConfig = loadLifetimeConfig(env);
  const getUserId = (
    /** @type {import("node:http").IncomingMessage} */ request
  ) => getAuth(
    /** @type {import("express").Request} */ (request)
  ).userId;
  const handler = createPlayerApiHandler({
    store,
    getUserId,
    recordAudit,
    rateLimit
  });
  const learningJournalHandler = createLearningJournalHandler({
    store: learningJournalStore,
    getUserId,
    recordAudit
  });
  const lifetimeHandler = createLifetimeHandler({
    getUserId,
    recordAudit,
    rateLimit,
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
  const questProgressHandler = createQuestProgressHandler({
    store: questProgressStore,
    getUserId,
    recordAudit
  });
  const clerkWebhookHandler = createClerkWebhookHandler({
    deleteUser: (userId) => userDeletionStore.deleteUser(userId),
    signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET,
    recordAudit
  });
  const accessHandler = createRunAccessHandler({
    store: accessStore,
    getUserId,
    enforcementEnabled:
      env.RUN_ACCESS_ENFORCEMENT_ENABLED === "true" &&
      lifetimeConfig !== null,
    recordEvent: recordProductEvent,
    recordAudit
  });

  if (!env.CLERK_PUBLISHABLE_KEY || !env.CLERK_SECRET_KEY) {
    const unavailableAuthHandler = createPlayerApiHandler({
      store,
      getUserId: () => null,
      rateLimit
    });
    const unavailableAccessHandler = createRunAccessHandler({
      store: accessStore,
      getUserId: () => null,
      enforcementEnabled: false
    });
    const unavailableLifetimeHandler = createLifetimeHandler({
      getUserId: () => null,
      recordAudit,
      rateLimit,
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
    const unavailableLearningJournalHandler = createLearningJournalHandler({
      store: learningJournalStore,
      getUserId: () => null
    });
    const unavailableQuestProgressHandler = createQuestProgressHandler({
      store: questProgressStore,
      getUserId: () => null
    });
    /**
     * @param {import("node:http").IncomingMessage} request
     * @param {import("node:http").ServerResponse} response
     * @param {(() => void) | undefined} next
     */
    return (request, response, next) => {
      const pathname = new URL(request.url ?? "", "http://local").pathname;
      if (pathname === CLERK_WEBHOOK_PATH) {
        void clerkWebhookHandler(request, response, next);
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
      if (pathname === LEARNING_JOURNAL_PATH) {
        void unavailableLearningJournalHandler(request, response, next);
        return;
      }
      if (QUEST_PROGRESS_PATHS.has(pathname)) {
        void unavailableQuestProgressHandler(request, response, next);
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
    if (pathname === CLERK_WEBHOOK_PATH) {
      void clerkWebhookHandler(request, response, next);
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
        if (pathname === LEARNING_JOURNAL_PATH) {
          void learningJournalHandler(request, response, next);
          return;
        }
        if (QUEST_PROGRESS_PATHS.has(pathname)) {
          void questProgressHandler(request, response, next);
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

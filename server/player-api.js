// First import on purpose: OpenTelemetry instrumentation (env-gated inside)
// must register before pg or any http client loads.
import "./telemetry-bootstrap.js";
import { clerkMiddleware, getAuth } from "@clerk/express";
import Stripe from "stripe";
import {
  CLERK_WEBHOOK_PATH,
  createClerkWebhookHandler
} from "./clerk-webhook-route.js";
import { createAdminHandler, isAdminPath } from "./admin-route.js";
import {
  createInternalHandler,
  isInternalPath
} from "./internal-route.js";
import {
  createWebhookInbox,
  createWebhookInboxStore
} from "./webhook-inbox.js";
import { createAuditStore } from "./audit-store.js";
import {
  createAuditRecorder,
  createRequestAuditor,
  SYSTEM_ACTORS
} from "./audit.js";
import { createQueryAdapter, getDatabasePool } from "./database.js";
import { createHealthHandler, isHealthPath } from "./health-route.js";
import { createLogger } from "./logger.js";
import { createRequestLogger } from "./request-log.js";
import { createRequestRateLimiter } from "./rate-limit-request.js";
import {
  reportAddressSalt,
  resolveAddressSalt,
  trustsProxyHeaders
} from "./request-identity.js";
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
import {
  createPermissionGuard,
  createRoleResolver,
  createRoleStore,
  publicAccess
} from "./rbac.js";
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
  const logRequest = createRequestLogger({ logger: createLogger(env) });
  const version =
    typeof env.VERCEL_GIT_COMMIT_SHA === "string" && env.VERCEL_GIT_COMMIT_SHA
      ? env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
      : "dev";
  const clerkConfigured = Boolean(
    env.CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY
  );
  if (!connectionString) {
    const healthHandler = createHealthHandler({
      version,
      checkDatabase: null,
      stripeConfigured: loadLifetimeConfig(env) !== null,
      clerkConfigured
    });
    /**
     * @param {import("node:http").IncomingMessage} request
     * @param {import("node:http").ServerResponse} response
     * @param {(() => void) | undefined} next
     */
    return function unavailablePlayerApi(request, response, next = undefined) {
      const pathname = new URL(request.url ?? "", "http://local").pathname;
      if (
        !PLAYER_PATHS.has(pathname) &&
        !isAdminPath(pathname) &&
        !isInternalPath(pathname) &&
        !isHealthPath(pathname)
      ) {
        next?.();
        return;
      }
      logRequest(request, response);
      if (isHealthPath(pathname)) {
        void healthHandler(request, response, next);
        return;
      }
      if (isAdminPath(pathname) || isInternalPath(pathname)) {
        // Without a database there is neither an authoritative role nor a
        // webhook inbox, so these deny rather than falling through to the SPA.
        sendError(response, 503, "These services are not configured.");
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
  const queryAdapter = createQueryAdapter(pool);
  const store = createPlayerStore(queryAdapter);
  const accessStore = createRunAccessStore(pool);
  const lifetimeStore = createLifetimeStore(pool);
  const learningJournalStore = createLearningJournalStore(queryAdapter);
  const questProgressStore = createQuestProgressStore(queryAdapter);
  const userDeletionStore = createUserDeletionStore(pool);
  reportAddressSalt(env);
  const auditRecorder = createAuditRecorder({ store: createAuditStore(pool) });
  const recordAudit = createRequestAuditor({
    recorder: auditRecorder,
    salt: resolveAddressSalt(env),
    trustProxy: trustsProxyHeaders(env)
  });
  const roleStore = createRoleStore(queryAdapter);
  const roleResolver = createRoleResolver({ store: roleStore });
  const lifetimeConfig = loadLifetimeConfig(env);
  const inboxStore = createWebhookInboxStore(queryAdapter);
  const healthHandler = createHealthHandler({
    version,
    checkDatabase: () => queryAdapter.query("SELECT 1"),
    stripeConfigured: lifetimeConfig !== null,
    clerkConfigured
  });
  const getUserId = (
    /** @type {import("node:http").IncomingMessage} */ request
  ) => getAuth(
    /** @type {import("express").Request} */ (request)
  ).userId;
  const requirePermission = createPermissionGuard({
    resolver: roleResolver,
    getUserId
  });
  const accessFor = async (
    /** @type {import("node:http").IncomingMessage} */ request,
    /** @type {string} */ userId
  ) => publicAccess(await roleResolver.roleFor(request, userId));
  const handler = createPlayerApiHandler({
    store,
    getUserId,
    recordAudit,
    rateLimit,
    accessFor
  });
  const adminHandler = createAdminHandler({
    store: roleStore,
    requirePermission,
    recordAudit,
    mirrorRole: createClerkRoleMirror(env)
  });
  const learningJournalHandler = createLearningJournalHandler({
    store: learningJournalStore,
    getUserId,
    recordAudit
  });
  // Hoisted so the webhook inbox can reach the same service instance the
  // route uses: the retry loop must take exactly the inline path's route.
  const lifetimeService = lifetimeConfig
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
    : unavailableLifetimeService();
  const inbox = createWebhookInbox({
    store: inboxStore,
    /**
     * Auditing lives here rather than in the routes so the retry loop produces
     * the same rows the inline path does. A delivery that only succeeds on its
     * fourth attempt must still leave the audit trail phase 1 requires.
     *
     * @param {string} provider
     * @param {{ eventType: string, payload: unknown }} event
     */
    async processEvent(provider, event) {
      if (provider === "stripe") {
        const result = /** @type {Record<string, unknown>} */ (
          await lifetimeService.processVerifiedWebhook(event.payload)
        );
        await auditRecorder.recordAudit(
          { actorId: SYSTEM_ACTORS.stripe, actorRole: "system" },
          "lifetime.webhook",
          {
            type: "lifetime_purchase",
            id: result?.purchaseId ? String(result.purchaseId) : null
          },
          undefined,
          {
            eventType: event.eventType,
            outcome: result?.outcome ?? null
          }
        );
        return;
      }
      if (event.eventType === "user.deleted") {
        const payload = /** @type {{ id?: unknown }} */ (event.payload ?? {});
        if (typeof payload.id !== "string" || !payload.id) {
          throw new Error("Clerk deletion event is invalid.");
        }
        await userDeletionStore.deleteUser(payload.id);
        await auditRecorder.recordAudit(
          { actorId: SYSTEM_ACTORS.clerk, actorRole: "system" },
          "user.delete",
          { type: "player_account", id: payload.id }
        );
      }
    }
  });
  const internalHandler = createInternalHandler({
    inbox,
    cronSecret: env.CRON_SECRET ?? ""
  });
  const lifetimeHandler = createLifetimeHandler({
    getUserId,
    recordAudit,
    rateLimit,
    inbox,
    service: lifetimeService
  });
  const questProgressHandler = createQuestProgressHandler({
    store: questProgressStore,
    getUserId,
    recordAudit
  });
  const clerkWebhookHandler = createClerkWebhookHandler({
    deleteUser: (userId) => userDeletionStore.deleteUser(userId),
    signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET,
    recordAudit,
    inbox
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
      inbox,
      // The same instance the configured branch uses. Building a second one
      // here previously meant this deployment ran pre-inbox Stripe handling
      // while its retry endpoint was live against the inbox.
      service: lifetimeService
    });
    const unavailableLearningJournalHandler = createLearningJournalHandler({
      store: learningJournalStore,
      getUserId: () => null
    });
    const unavailableAdminHandler = createAdminHandler({
      store: roleStore,
      requirePermission: createPermissionGuard({
        resolver: roleResolver,
        getUserId: () => null
      })
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
      if (
        PLAYER_PATHS.has(pathname) ||
        isAdminPath(pathname) ||
        isInternalPath(pathname) ||
        isHealthPath(pathname)
      ) {
        logRequest(request, response);
      }
      if (isHealthPath(pathname)) {
        void healthHandler(request, response, next);
        return;
      }
      if (pathname === CLERK_WEBHOOK_PATH) {
        void clerkWebhookHandler(request, response, next);
        return;
      }
      if (isInternalPath(pathname)) {
        // Internal routes never needed Clerk, so they work here unchanged.
        void internalHandler(request, response, next);
        return;
      }
      if (isAdminPath(pathname)) {
        // No Clerk means no admin identity, so every admin route is 401 rather
        // than silently unguarded.
        void unavailableAdminHandler(request, response, next);
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
    if (
      !PLAYER_PATHS.has(pathname) &&
      !isAdminPath(pathname) &&
      !isInternalPath(pathname) &&
      !isHealthPath(pathname)
    ) {
      next?.();
      return;
    }
    logRequest(request, response);
    if (isHealthPath(pathname)) {
      void healthHandler(request, response, next);
      return;
    }
    if (isInternalPath(pathname)) {
      // Authenticated by shared secret, not Clerk: the caller is Vercel cron
      // and has no Explorer identity.
      void internalHandler(request, response, next);
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
        if (isAdminPath(pathname)) {
          void adminHandler(request, response, next);
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

/**
 * Mirrors the role into Clerk `publicMetadata` so the browser can gate UI
 * without an extra round trip. The database row stays authoritative — nothing
 * server-side ever reads this claim.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function createClerkRoleMirror(env) {
  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return async () => {};
  }
  /**
   * @param {string} userId
   * @param {string} role
   */
  return async function mirrorRole(userId, role) {
    const response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}/metadata`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${secretKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ public_metadata: { role } }),
        // The database write has already committed by this point; a slow Clerk
        // must not hold the admin's request open behind it.
        signal: AbortSignal.timeout(5000)
      }
    );
    if (!response.ok) {
      throw new Error(`Clerk metadata update failed with ${response.status}.`);
    }
  };
}

function unavailableLifetimeService() {
  const unavailable = async () => {
    throw new Error("Lifetime Membership is not configured.");
  };
  return {
    confirmCheckout: unavailable,
    createCheckout: unavailable,
    processWebhook: unavailable,
    processVerifiedWebhook: unavailable,
    verifyWebhook: () => {
      throw new Error("Lifetime Membership is not configured.");
    }
  };
}

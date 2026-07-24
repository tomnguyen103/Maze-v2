import { clerkMiddleware, getAuth } from "@clerk/express";
import { createDatabasePool } from "./database.js";
import { createPlayerApiHandler } from "./player-route.js";
import { createPlayerStore } from "./player-store.js";
import { URL } from "node:url";

const PLAYER_PATHS = new Set([
  "/api/profile",
  "/api/leaderboard",
  "/api/scores"
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
      sendError(
        response,
        503,
        "Player services are not configured. Guest play still works."
      );
    };
  }

  const pool = createDatabasePool(connectionString);
  const store = createPlayerStore({
    async query(sql, values) {
      const result = await pool.query(sql, values);
      return { rows: result.rows };
    }
  });
  const handler = createPlayerApiHandler({
    store,
    getUserId: (request) =>
      getAuth(/** @type {import("express").Request} */ (request)).userId
  });

  if (!env.CLERK_PUBLISHABLE_KEY || !env.CLERK_SECRET_KEY) {
    return createPlayerApiHandler({
      store,
      getUserId: () => null
    });
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
    if (pathname === "/api/leaderboard") {
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
        void handler(request, response, next);
      }
    );
  };
}

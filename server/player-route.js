import {
  InputError,
  validateProfileInput,
  validateScoreInput
} from "./player-validation.js";
import { safeErrorName } from "./safe-error-log.js";
import { UNMETERED } from "./rate-limit-config.js";
import { sendRateLimited } from "./rate-limit-request.js";
import { URL } from "node:url";

const MAX_BODY_BYTES = 16 * 1024;

/** @param {import("node:http").ServerResponse} response */
function noStore(response) {
  response.setHeader("cache-control", "no-store");
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  noStore(response);
  response.end(JSON.stringify(body));
}

/** @param {import("node:http").IncomingMessage} request */
async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new InputError("Request body is too large.");
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new InputError("Request body must be valid JSON.");
  }
}

/** @param {Record<string, unknown> | null} profile */
function publicProfile(profile) {
  if (!profile) {
    return null;
  }
  return {
    username: profile.username,
    explorerPalette: profile.explorerPalette,
    playgroundPalette: profile.playgroundPalette
  };
}

/** @param {Record<string, unknown>} entry */
function publicScoreEntry(entry) {
  return {
    ...(Number.isInteger(entry.rank) ? { rank: entry.rank } : {}),
    username: entry.username,
    score: entry.score,
    levelId: entry.levelId,
    labyrinthNumber: entry.labyrinthNumber,
    moves: entry.moves,
    elapsedMs: entry.elapsedMs
  };
}

/** @param {unknown} error */
function isUniqueViolation(error) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  );
}

/**
 * @param {{
 *   store: {
 *     getProfile: (userId: string) => Promise<Record<string, unknown> | null>,
 *     saveProfile: (
 *       userId: string,
 *       profile: {
 *         username: string,
 *         usernameKey: string,
 *         explorerPalette: string,
 *         playgroundPalette: string
 *       }
 *     ) => Promise<Record<string, unknown>>,
 *     getLeaderboard: () => Promise<{
 *       entries: Record<string, unknown>[],
 *       globalMaxScore: number
 *     }>,
 *     submitScore: (
 *       userId: string,
 *       run: ReturnType<typeof validateScoreInput>
 *     ) => Promise<{
 *       entry: Record<string, unknown>,
 *       duplicate: boolean
 *     }>
 *   },
 *   getUserId: (
 *     request: import("node:http").IncomingMessage
 *   ) => string | null | Promise<string | null>,
 *   recordAudit?: import("./audit.js").RecordAudit,
 *   rateLimit?: import("./rate-limit-request.js").RateLimit,
 *   accessFor?: (
 *     request: import("node:http").IncomingMessage,
 *     userId: string
 *   ) => Promise<{ role: string, permissions: string[] }>
 * }} dependencies
 */
export function createPlayerApiHandler({
  store,
  getUserId,
  recordAudit = async () => {},
  rateLimit = async () => UNMETERED,
  accessFor = async () => ({ role: "player", permissions: [] })
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} next
   */
  return async function playerApiHandler(request, response, next) {
    const url = new URL(request.url ?? "", "http://local");
    if (
      !["/api/profile", "/api/leaderboard", "/api/scores"].includes(
        url.pathname
      )
    ) {
      next?.();
      return;
    }

    try {
      if (url.pathname === "/api/leaderboard") {
        if (request.method !== "GET") {
          response.setHeader("allow", "GET");
          sendJson(response, 405, { error: "Use GET for the Global Scoreboard." });
          return;
        }
        const leaderboard = await store.getLeaderboard();
        sendJson(response, 200, {
          entries: leaderboard.entries.map(publicScoreEntry),
          globalMaxScore: leaderboard.globalMaxScore
        });
        return;
      }

      const userId = await getUserId(request);
      if (!userId) {
        sendJson(response, 401, { error: "Sign in to continue." });
        return;
      }

      if (url.pathname === "/api/profile") {
        if (request.method === "GET") {
          sendJson(response, 200, {
            profile: publicProfile(await store.getProfile(userId)),
            // For hiding UI only. Every guarded route re-checks server-side.
            access: await accessFor(request, userId)
          });
          return;
        }
        if (request.method === "PUT") {
          const decision = await rateLimit("profile.write", request, userId);
          if (!decision.allowed) {
            sendRateLimited(
              response,
              decision,
              "Too many Player Profile changes. Try again shortly."
            );
            return;
          }
          const profile = validateProfileInput(await readJsonBody(request));
          const before = publicProfile(await store.getProfile(userId));
          const after = publicProfile(await store.saveProfile(userId, profile));
          await recordAudit(request, {
            actorId: userId,
            action: "profile.update",
            resource: { type: "player_profile", id: userId },
            before,
            after
          });
          sendJson(response, 200, { profile: after });
          return;
        }
        response.setHeader("allow", "GET, PUT");
        sendJson(response, 405, { error: "Use GET or PUT for Player Profiles." });
        return;
      }

      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        sendJson(response, 405, { error: "Use POST for Run Scores." });
        return;
      }
      const decision = await rateLimit("score.submit", request, userId);
      if (!decision.allowed) {
        sendRateLimited(
          response,
          decision,
          "Too many Run Score submissions. Try again shortly."
        );
        return;
      }
      if (!(await store.getProfile(userId))) {
        sendJson(response, 409, {
          error: "Create a username before submitting a score."
        });
        return;
      }
      const result = await store.submitScore(
        userId,
        validateScoreInput(await readJsonBody(request))
      );
      await recordAudit(request, {
        actorId: userId,
        action: "score.submit",
        resource: { type: "score_entry", id: userId },
        after: {
          duplicate: result.duplicate,
          labyrinthNumber: result.entry.labyrinthNumber,
          levelId: result.entry.levelId,
          score: result.entry.score
        }
      });
      sendJson(response, result.duplicate ? 200 : 201, {
        entry: publicScoreEntry(result.entry),
        duplicate: result.duplicate
      });
    } catch (error) {
      if (
        error instanceof InputError ||
        isUniqueViolation(error)
      ) {
        sendJson(response, error instanceof InputError ? 400 : 409, {
          error:
            error instanceof InputError
              ? error.message
              : "That username is already in use."
        });
        return;
      }
      console.error("[players] API request failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 500, {
        error: "Player services are unavailable. Guest play still works."
      });
    }
  };
}

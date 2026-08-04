import {
  createDailyContract,
  getDailyQuestion,
  utcDateKey
} from "../src/game/daily-labyrinth.js";
import { answerDeletedUser } from "./deleted-user-guard.js";
import { setRetryAfter } from "./http-retry.js";
import { getLabyrinthConfig } from "../src/questions/quest-levels.js";
import { collectTrailMarkers } from "./constellation-markers.js";
import { ReplayInputError, verifyRunReplay } from "./run-replay.js";
import { safeErrorName } from "./safe-error-log.js";
import { UNMETERED } from "./rate-limit-config.js";
import { sendRateLimited } from "./rate-limit-request.js";
import { URL } from "node:url";

export const DAILY_LEADERBOARD_PATH = "/api/daily/leaderboard";
export const DAILY_SCORES_PATH = "/api/daily/scores";
export const DAILY_CONSTELLATION_PATH = "/api/daily/constellation";
export const DAILY_PATHS = new Set([
  DAILY_LEADERBOARD_PATH,
  DAILY_SCORES_PATH,
  DAILY_CONSTELLATION_PATH
]);

const MAX_BODY_BYTES = 64 * 1024;
const IDEMPOTENCY_PATTERN = /^[a-z0-9_-]{12,128}$/i;
const CONTRACT_KEYS = [
  "version",
  "date",
  "seed",
  "levelId",
  "labyrinthNumber",
  "questionStartOrdinal"
];
const CLAIM_KEYS = [
  "status",
  "score",
  "wardensDefeated",
  "echoesCollected",
  "moves",
  "elapsedMs"
];

class DailyInputError extends Error {
  /** @param {string} message @param {number} [status] */
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {{
 *   store: {
 *     getLeaderboard: (date: string, limit?: number) => Promise<Record<string, unknown>[]>,
 *     submitVerifiedEntry: (
 *       userId: string,
 *       entry: {
 *         idempotencyKey: string,
 *         date: string,
 *         dailyVersion: number,
 *         username: string,
 *         score: number,
 *         wardensDefeated: number,
 *         echoesCollected: number,
 *         moves: number,
 *         elapsedMs: number
 *       }
 *     ) => Promise<{
 *       duplicate: boolean,
 *       improved: boolean,
 *       bestResult: "created" | "improved" | "unchanged",
 *       entry: Record<string, unknown>
 *     }>
 *   },
 *   getUserId: (
 *     request: import("node:http").IncomingMessage
 *   ) => string | null | Promise<string | null>,
 *   getProfile: (userId: string) => Promise<Record<string, unknown> | null>,
 *   constellation?: {
 *     recordContribution: (
 *       userId: string,
 *       date: string,
 *       markers: import("./constellation-markers.js").TrailMarker[]
 *     ) => Promise<{ contributed: boolean }>,
 *     readProjection?: (date: string) => Promise<{
 *       published: boolean,
 *       markers: import("../shared/constellation.js").ConstellationMarker[]
 *     }>
 *   } | null,
 *   now?: () => Date,
 *   recordAudit?: import("./audit.js").RecordAudit,
 *   rateLimit?: import("./rate-limit-request.js").RateLimit
 * }} dependencies
 */
export function createDailyHandler({
  store,
  getUserId,
  getProfile,
  constellation = null,
  now = () => new Date(),
  recordAudit = async () => {},
  rateLimit = async () => UNMETERED
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} next
   */
  return async function dailyHandler(request, response, next = undefined) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!DAILY_PATHS.has(pathname)) {
      next?.();
      return;
    }
    const daily = createDailyContract(utcDateKey(now()));

    try {
      if (pathname === DAILY_LEADERBOARD_PATH) {
        if (request.method !== "GET") {
          response.setHeader("allow", "GET");
          sendJson(response, 405, {
            error: "Use GET for the Verified Daily Board."
          });
          return;
        }
        sendJson(response, 200, {
          date: daily.date,
          contractVersion: daily.version,
          verification: "verified-replay-v1",
          entries: (await store.getLeaderboard(daily.date, 10)).map(publicEntry)
        });
        return;
      }

      if (pathname === DAILY_CONSTELLATION_PATH) {
        if (request.method !== "GET") {
          response.setHeader("allow", "GET");
          sendJson(response, 405, {
            error: "Use GET for the Daily Trail Constellation."
          });
          return;
        }
        // Guests may read this after escaping, so it cannot require an
        // identity — which leaves it the one Daily read an anonymous caller
        // can repeat freely. Each call costs two definer round trips, so it
        // carries the same budget the Verified Daily Board does.
        const projectionDecision = await rateLimit(
          "daily.constellation",
          request,
          null
        );
        if (!projectionDecision.allowed) {
          sendRateLimited(
            response,
            projectionDecision,
            "Too many Constellation requests. Try again shortly."
          );
          return;
        }
        // Band labels only, for the canonical UTC Daily and no other. A Daily
        // that has not reached its thresholds reports itself as unpublished
        // rather than failing, so the surface can say it is still forming.
        const projection = (await constellation?.readProjection?.(
          daily.date
        )) ?? { published: false, markers: [] };
        sendJson(response, 200, {
          date: daily.date,
          published: projection.published,
          markers: projection.markers
        });
        return;
      }

      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        sendJson(response, 405, {
          error: "Use POST for a verified Daily result."
        });
        return;
      }
      const userId = await getUserId(request);
      if (!userId) {
        sendJson(response, 401, {
          error: "Sign in to join the Verified Daily Board."
        });
        return;
      }
      const profile = await getProfile(userId);
      if (!profile) {
        sendJson(response, 409, {
          error: "Create a username before joining the Verified Daily Board."
        });
        return;
      }
      const decision = await rateLimit("score.submit", request, userId);
      if (!decision.allowed) {
        sendRateLimited(
          response,
          decision,
          "Too many Daily result submissions. Try again shortly."
        );
        return;
      }

      const input = validateSubmission(await readJsonBody(request), daily);
      // The Constellation's markers are derived from the same pass that
      // verifies the Run, so the submitted log is read once, in request
      // memory, and nothing derived from it outlives this request beyond the
      // position set the aggregate is allowed to hold.
      const trail = collectTrailMarkers();
      const result = verifyRunReplay(input.actionLog, {
        seed: daily.seed,
        config: getLabyrinthConfig(daily.levelId, daily.labyrinthNumber),
        questionFor: (index) => getDailyQuestion(daily, index),
        onStep: trail.observe
      });
      if (result.status !== "won") {
        throw new DailyInputError(
          "Only an escaped Verified Run can enter the Daily Board."
        );
      }
      assertClaimMatches(input.claimed, result);
      const stored = await store.submitVerifiedEntry(userId, {
        idempotencyKey: input.idempotencyKey,
        date: daily.date,
        dailyVersion: daily.version,
        username: String(profile.username),
        score: result.score,
        wardensDefeated: result.wardensDefeated,
        echoesCollected: result.echoesCollected,
        moves: result.moves,
        elapsedMs: result.elapsedMs
      });
      if (constellation) {
        try {
          await constellation.recordContribution(
            userId,
            daily.date,
            trail.collected()
          );
        } catch (error) {
          // A Constellation that cannot aggregate must never cost an Explorer
          // the verified result they already earned. The PostgreSQL SQLSTATE
          // is logged beside the safe name because a systematic outage — a
          // missing migration, a constraint violation, a lock timeout — is
          // otherwise indistinguishable from a one-off, and the code itself
          // carries no Explorer data.
          console.error("[daily] Constellation aggregation failed", {
            name: safeErrorName(error),
            code: sqlStateOf(error)
          });
        }
      }
      await recordAudit(request, {
        actorId: userId,
        action: "daily.score.submit",
        resource: { type: "verified_daily_entry", id: daily.date },
        after: {
          duplicate: stored.duplicate,
          improved: stored.improved,
          bestResult: stored.bestResult,
          date: daily.date,
          score: result.score,
          moves: result.moves
        }
      });
      sendJson(
        response,
        !stored.duplicate && stored.bestResult === "created" ? 201 : 200,
        {
          date: daily.date,
          verification: "verified-replay-v1",
          duplicate: stored.duplicate,
          improved: stored.improved,
          bestResult: stored.bestResult,
          entry: publicEntry(stored.entry)
        }
      );
    } catch (error) {
      if (answerDeletedUser(error, response)) {
        return;
      }
      if (error instanceof DailyInputError || error instanceof ReplayInputError) {
        sendJson(
          response,
          error instanceof DailyInputError ? error.status : 400,
          { error: error.message }
        );
        return;
      }
      console.error("[daily] API request failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 500, {
        error: "Verified Daily services are unavailable. Local Daily play still works."
      });
    }
  };
}

/** @param {import("node:http").IncomingMessage} request */
export async function readJsonBody(request) {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new DailyInputError("Daily result is too large.", 413);
  }
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new DailyInputError("Daily result is too large.", 413);
    }
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(body);
  } catch {
    throw new DailyInputError("Daily result must be valid JSON.");
  }
}

/** @param {unknown} value @param {ReturnType<typeof createDailyContract>} daily */
function validateSubmission(value, daily) {
  const input = record(value, "Daily submission must be an object.");
  if (
    !hasOnlyKeys(input, [
      "idempotencyKey",
      "contract",
      "actionLog",
      "claimed"
    ]) ||
    typeof input.idempotencyKey !== "string" ||
    !IDEMPOTENCY_PATTERN.test(input.idempotencyKey)
  ) {
    throw new DailyInputError("Daily submission is not valid.");
  }
  const contract = record(input.contract, "Daily contract must be an object.");
  if (
    !hasOnlyKeys(contract, CONTRACT_KEYS) ||
    CONTRACT_KEYS.some(
      (key) =>
        contract[key] !==
        /** @type {Record<string, unknown>} */ (daily)[key]
    )
  ) {
    throw new DailyInputError(
      "Only the current UTC Daily contract can be verified.",
      409
    );
  }
  const claimed = record(input.claimed, "Daily result claim must be an object.");
  if (
    !hasOnlyKeys(claimed, CLAIM_KEYS) ||
    typeof claimed.status !== "string" ||
    CLAIM_KEYS.slice(1).some((key) => !Number.isInteger(claimed[key]))
  ) {
    throw new DailyInputError("Daily result claim is not valid.");
  }
  return {
    idempotencyKey: input.idempotencyKey,
    actionLog: input.actionLog,
    claimed
  };
}

/**
 * @param {Record<string, unknown>} claimed
 * @param {ReturnType<typeof verifyRunReplay>} result
 */
function assertClaimMatches(claimed, result) {
  if (
    claimed.status !== result.status ||
    claimed.score !== result.score ||
    claimed.wardensDefeated !== result.wardensDefeated ||
    claimed.echoesCollected !== result.echoesCollected ||
    claimed.moves !== result.moves ||
    claimed.elapsedMs !== result.elapsedMs
  ) {
    throw new DailyInputError(
      "Daily result does not match the server replay."
    );
  }
}

/**
 * PostgreSQL puts its five-character SQLSTATE on `error.code`. It names a
 * failure class and never carries a value from the row that failed.
 *
 * @param {unknown} error
 */
function sqlStateOf(error) {
  const code = /** @type {{ code?: unknown }} */ (error)?.code;
  return typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
    ? code
    : "unknown";
}

/** @param {Record<string, unknown>} entry */
function publicEntry(entry) {
  return {
    ...(Number.isInteger(entry.rank) ? { rank: entry.rank } : {}),
    username: entry.username,
    score: entry.score,
    moves: entry.moves
  };
}

/** @param {unknown} value @param {string} message */
function record(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DailyInputError(message);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {Record<string, unknown>} value @param {string[]} keys */
function hasOnlyKeys(value, keys) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(response, status, body) {
  response.statusCode = status;
  setRetryAfter(response, status);
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

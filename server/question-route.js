import { QUEST_LEVELS } from "../src/questions/quest-levels.js";
import { UNMETERED } from "./rate-limit-config.js";
import { sendRateLimited } from "./rate-limit-request.js";
import { URL } from "node:url";
import { safeErrorName } from "./safe-error-log.js";
import { setRetryAfter } from "./http-retry.js";
import { getPublishedLearningDeckOption } from "../src/questions/learning-deck-catalog.js";
import { isPublishedLearningDeckRevision } from "../src/questions/learning-deck-identity.js";

/** @type {Set<string>} */
const LEVEL_IDS = new Set(QUEST_LEVELS.map((level) => level.id));
const CHALLENGE_KINDS = new Set(["warden", "gate-warden"]);
const SEED_PATTERN = /^[a-z0-9-]{1,32}$/i;
const QUEST_ID_PATTERN = /^(?:quest|legacy)_[a-z0-9_-]{7,92}$/i;

/** @param {string | null} value @returns {string | undefined} */
function parseQuestId(value) {
  if (!value) {
    return undefined;
  }
  if (!QUEST_ID_PATTERN.test(value)) {
    throw new QuestionInputError("Quest ID is not valid.");
  }
  return value;
}

/**
 * @param {string | null} value
 * @param {string} name
 * @param {number} minimum
 * @param {number} maximum
 */
function boundedInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new QuestionInputError(
      `${name} must be a whole number from ${minimum} to ${maximum}.`
    );
  }
  return parsed;
}

const QUESTION_ID_PATTERN = /^[a-z0-9][a-z0-9:-]{0,79}$/i;
const MAX_USED_QUESTION_IDS = 5000;

/**
 * The Quest's own uniqueness ledger. It is the only way the server can know
 * which of a focused Region's finite reviewed pool this Quest has spent, and
 * it carries no answer history — Question identifiers only.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function parseUsedQuestionIds(value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_USED_QUESTION_IDS) {
    throw new QuestionInputError("Used Question identifiers are not valid.");
  }
  for (const id of value) {
    if (typeof id !== "string" || !QUESTION_ID_PATTERN.test(id)) {
      throw new QuestionInputError("Used Question identifiers are not valid.");
    }
  }
  return /** @type {string[]} */ (value);
}

/**
 * @param {string | null | undefined} deckId
 * @param {string | null | undefined} deckRevision
 */
function parseLearningDeck(deckId, deckRevision) {
  if (!deckId && !deckRevision) {
    return { learningDeckId: null, learningDeckRevision: null };
  }
  // Validated against the published roster, not merely against a shape, so
  // this boundary behaves like the Quest Level and challenge-kind checks
  // above it. An unpublished revision is rejected rather than silently
  // serving Mixed content under the Deck's name.
  if (!deckId || !getPublishedLearningDeckOption(deckId)) {
    throw new QuestionInputError("Learning Deck is not supported.");
  }
  if (!isPublishedLearningDeckRevision(deckId, deckRevision)) {
    throw new QuestionInputError("Learning Deck revision is not supported.");
  }
  return { learningDeckId: deckId, learningDeckRevision: deckRevision };
}

/**
 * A request this route can name a problem with. Anything else is a fault on
 * our side and must not have its own text returned: a `pg` failure carries the
 * failing SQL in `message`, and this route answers unauthenticated callers.
 */
export class QuestionInputError extends Error {}

/** @param {URL} url */
export function parseQuestionRequest(url) {
  const levelId = url.searchParams.get("level") ?? "";
  const seed = url.searchParams.get("seed") ?? "";
  const challengeKind = url.searchParams.get("challenge") ?? "warden";

  if (!LEVEL_IDS.has(levelId)) {
    throw new QuestionInputError("Quest Level is not supported.");
  }
  if (!SEED_PATTERN.test(seed)) {
    throw new QuestionInputError("Run seed is not valid.");
  }
  if (!CHALLENGE_KINDS.has(challengeKind)) {
    throw new QuestionInputError("Challenge kind is not supported.");
  }

  const questId = parseQuestId(url.searchParams.get("quest"));

  return {
    levelId,
    seed,
    wardenId: boundedInteger(url.searchParams.get("warden"), "Warden", 0, 20),
    attempt: boundedInteger(url.searchParams.get("attempt"), "Attempt", 0, 20),
    labyrinthNumber: boundedInteger(
      url.searchParams.get("labyrinth"),
      "Labyrinth",
      1,
      20
    ),
    questionOrdinal: boundedInteger(
      url.searchParams.get("question"),
      "Question",
      0,
      5000
    ),
    challengeKind,
    ...parseLearningDeck(
      url.searchParams.get("deck"),
      url.searchParams.get("deckRevision")
    ),
    usedQuestionIds: [],
    ...(questId ? { questId } : {})
  };
}

/**
 * The focused path posts the Quest's used-Question ledger, which does not fit
 * a query string. Every other field matches the GET contract exactly, so
 * recovery, Replay, Classroom, and legacy callers keep working unchanged.
 *
 * @param {Record<string, unknown>} body
 */
export function parseQuestionBody(body) {
  if (!body || typeof body !== "object") {
    throw new QuestionInputError("Question request must be an object.");
  }
  const url = new URL("http://local/api/question");
  for (const [key, parameter] of [
    ["levelId", "level"],
    ["seed", "seed"],
    ["wardenId", "warden"],
    ["attempt", "attempt"],
    ["labyrinthNumber", "labyrinth"],
    ["questionOrdinal", "question"],
    ["challengeKind", "challenge"],
    ["questId", "quest"],
    ["learningDeckId", "deck"],
    ["learningDeckRevision", "deckRevision"]
  ]) {
    const value = body[key];
    if (value !== undefined && value !== null) {
      url.searchParams.set(parameter, String(value));
    }
  }
  return {
    ...parseQuestionRequest(url),
    usedQuestionIds: parseUsedQuestionIds(body.usedQuestionIds)
  };
}

const MAX_BODY_BYTES = 256 * 1024;

/** @param {import("node:http").IncomingMessage} request */
async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new QuestionInputError("Question request body is too large.");
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new QuestionInputError("Request body must be valid JSON.");
  }
}

/**
 * @param {{
 *   maxRequests?: number,
 *   windowMs?: number,
 *   now?: () => number
 * }} [options]
 */
export function createQuestionRateLimiter(options = {}) {
  const maxRequests = options.maxRequests ?? 30;
  const windowMs = options.windowMs ?? 60000;
  const now = options.now ?? Date.now;
  let windowStartedAt = now();
  let requestCount = 0;

  return {
    allow() {
      const currentTime = now();
      if (currentTime - windowStartedAt >= windowMs) {
        windowStartedAt = currentTime;
        requestCount = 0;
      }
      if (requestCount >= maxRequests) {
        return false;
      }
      requestCount += 1;
      return true;
    },
    retryAfterSeconds() {
      return Math.max(
        1,
        Math.ceil((windowMs - (now() - windowStartedAt)) / 1000)
      );
    }
  };
}

/**
 * @param {{ getQuestion: (request: {
 *   levelId: string,
 *   seed: string,
 *   wardenId: number,
 *   attempt: number,
 *   labyrinthNumber: number,
 *   questionOrdinal: number,
 *   questId?: string
 * }) => Promise<unknown> }} questionService
 * @param {{
 *   maxRequests?: number,
 *   windowMs?: number,
 *   now?: () => number,
 *   getUserId?: (
 *     request: import("node:http").IncomingMessage
 *   ) => string | null,
 *   rateLimit?: import("./rate-limit-request.js").RateLimit
 * }} [options]
 */
export function createQuestionHandler(questionService, options = {}) {
  // Two independent limits. The instance throttle caps what a single warm
  // container pushes at the question provider; the per-caller budget is durable
  // across serverless invocations and stops one Explorer spending the rest.
  const instanceThrottle = createQuestionRateLimiter(options);
  const getUserId = options.getUserId ?? (() => null);
  const rateLimit = options.rateLimit ?? (async () => UNMETERED);
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} next
   */
  return async function questionHandler(request, response, next) {
    const url = new URL(request.url ?? "", "http://local");
    if (url.pathname !== "/api/question") {
      next?.();
      return;
    }
    if (request.method !== "GET" && request.method !== "POST") {
      response.statusCode = 405;
      response.setHeader("allow", "GET, POST");
      response.end(
        JSON.stringify({ error: "Use GET or POST for Question requests." })
      );
      return;
    }
    if (!instanceThrottle.allow()) {
      // Same body and headers as the durable limiter: one route must not answer
      // two different shapes depending on which limit rejected it.
      sendRateLimited(
        response,
        { retryAfterSeconds: instanceThrottle.retryAfterSeconds() },
        "Question scrolls are resting. Please try again soon."
      );
      return;
    }
    const resolvedUserId = getUserId(request);
    const userId =
      typeof resolvedUserId === "string" && resolvedUserId
        ? resolvedUserId
        : null;
    const decision = await rateLimit("question.fetch", request, userId);
    if (!decision.allowed) {
      sendRateLimited(
        response,
        decision,
        "Question scrolls are resting. Please try again soon."
      );
      return;
    }

    try {
      const questionRequest = request.method === "POST"
        ? parseQuestionBody(await readJsonBody(request))
        : parseQuestionRequest(url);
      const result = await questionService.getQuestion(questionRequest);
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.end(JSON.stringify(result));
    } catch (error) {
      if (error instanceof QuestionInputError) {
        response.statusCode = 400;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ error: error.message }));
        return;
      }
      console.error("[question] request failed", {
        name: safeErrorName(error)
      });
      response.statusCode = 503;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      setRetryAfter(response, 503);
      response.end(
        JSON.stringify({
          error: "Question scrolls are unavailable. Try again."
        })
      );
    }
  };
}

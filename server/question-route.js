import { QUEST_LEVELS } from "../src/questions/quest-levels.js";
import { URL } from "node:url";

/** @type {Set<string>} */
const LEVEL_IDS = new Set(QUEST_LEVELS.map((level) => level.id));
const SEED_PATTERN = /^[a-z0-9-]{1,32}$/i;

/**
 * @param {string | null} value
 * @param {string} name
 * @param {number} minimum
 * @param {number} maximum
 */
function boundedInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be a whole number from ${minimum} to ${maximum}.`
    );
  }
  return parsed;
}

/** @param {URL} url */
export function parseQuestionRequest(url) {
  const levelId = url.searchParams.get("level") ?? "";
  const seed = url.searchParams.get("seed") ?? "";

  if (!LEVEL_IDS.has(levelId)) {
    throw new Error("Quest Level is not supported.");
  }
  if (!SEED_PATTERN.test(seed)) {
    throw new Error("Run seed is not valid.");
  }

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
    )
  };
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
 *   questionOrdinal: number
 * }) => Promise<unknown> }} questionService
 * @param {{ maxRequests?: number, windowMs?: number, now?: () => number }} [options]
 */
export function createQuestionHandler(questionService, options = {}) {
  const rateLimiter = createQuestionRateLimiter(options);
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
    if (request.method !== "GET") {
      response.statusCode = 405;
      response.setHeader("allow", "GET");
      response.end(JSON.stringify({ error: "Use GET for Question requests." }));
      return;
    }
    if (!rateLimiter.allow()) {
      response.statusCode = 429;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader(
        "retry-after",
        String(rateLimiter.retryAfterSeconds())
      );
      response.end(
        JSON.stringify({
          error: "Question scrolls are resting. Please try again soon."
        })
      );
      return;
    }

    try {
      const questionRequest = parseQuestionRequest(url);
      const result = await questionService.getQuestion(questionRequest);
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = 400;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Question request failed."
        })
      );
    }
  };
}

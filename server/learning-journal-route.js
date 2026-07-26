import {
  createLanternJournal,
  normalizeLanternJournal
} from "../src/learning/lantern-journal.js";
import { URL } from "node:url";
import { safeErrorName } from "./safe-error-log.js";

export const LEARNING_JOURNAL_PATH = "/api/learning-journal";
const MAX_BODY_BYTES = 128 * 1024;
const EVENT_KEYS = [
  "difficultyBand",
  "eventId",
  "learningObjectiveId",
  "outcome",
  "questionId",
  "topicId"
];

/**
 * @param {{
 *   store: {
 *     getJournal: (userId: string) => Promise<unknown>,
 *     saveJournal: (userId: string, journal: unknown) => Promise<unknown>,
 *     clearJournal: (userId: string) => Promise<void>
 *   },
 *   getUserId: (request: import("node:http").IncomingMessage) => string | null | Promise<string | null>
 * }} dependencies
 */
export function createLearningJournalHandler({ store, getUserId }) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function learningJournalHandler(request, response, next) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (pathname !== LEARNING_JOURNAL_PATH) {
      next?.();
      return;
    }
    try {
      const userId = await getUserId(request);
      if (!userId) {
        sendJson(response, 401, { error: "Sign in to sync the Lantern Journal." });
        return;
      }
      if (request.method === "GET") {
        const journal =
          normalizeLanternJournal(await store.getJournal(userId)) ??
          createLanternJournal();
        sendJson(response, 200, { journal });
        return;
      }
      if (request.method === "PUT") {
        const raw = await readJsonBody(request);
        const journal = hasExactShape(raw) ? normalizeLanternJournal(raw) : null;
        if (!journal) {
          sendJson(response, 400, {
            error: "Journal must contain only reviewed coarse learning outcomes."
          });
          return;
        }
        const saved =
          normalizeLanternJournal(await store.saveJournal(userId, journal)) ??
          journal;
        sendJson(response, 200, { journal: saved });
        return;
      }
      if (request.method === "DELETE") {
        await store.clearJournal(userId);
        response.statusCode = 204;
        response.setHeader("cache-control", "no-store");
        response.end();
        return;
      }
      response.setHeader("allow", "GET, PUT, DELETE");
      sendJson(response, 405, {
        error: "Use GET, PUT, or DELETE for the Lantern Journal."
      });
    } catch (error) {
      if (error instanceof JournalInputError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      console.error("[learning-journal] API request failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 500, {
        error: "Lantern Journal cloud sync is unavailable."
      });
    }
  };
}

/** @param {unknown} value */
function hasExactShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const journal = /** @type {Record<string, unknown>} */ (value);
  if (
    Object.keys(journal).sort().join(",") !== "events,version" ||
    !Array.isArray(journal.events)
  ) {
    return false;
  }
  return journal.events.every(
    (event) =>
      event &&
      typeof event === "object" &&
      !Array.isArray(event) &&
      Object.keys(event).sort().join(",") === EVENT_KEYS.join(",")
  );
}

/** @param {import("node:http").IncomingMessage} request */
async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new JournalInputError("Journal request is too large.");
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new JournalInputError("Journal request must be valid JSON.");
  }
}

/** @param {import("node:http").ServerResponse} response @param {number} status @param {unknown} body */
function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

class JournalInputError extends Error {}

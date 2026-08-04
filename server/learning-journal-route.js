import {
  createLanternJournal,
  normalizeLanternJournal
} from "../src/learning/lantern-journal.js";
import { setRetryAfter } from "./http-retry.js";
import { URL } from "node:url";
import { safeErrorName } from "./safe-error-log.js";
import {
  JournalClearConflictError
} from "./learning-journal-store.js";
import { DeletedUserError } from "./deleted-user-guard.js";
import {
  ClassroomAccessDeniedError,
  ClassroomContextError,
  classroomIdFromRequest
} from "./classroom-context.js";

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
 *     getJournal: (userId: string, classroomId?: string | null) => Promise<unknown>,
 *     saveJournal: (userId: string, journal: unknown, clearGeneration: number, classroomId?: string | null) => Promise<unknown>,
 *     clearJournal: (userId: string, classroomId?: string | null) => Promise<unknown>
 *   },
 *   getUserId: (request: import("node:http").IncomingMessage) => string | null | Promise<string | null>,
 *   recordAudit?: import("./audit.js").RecordAudit
 * }} dependencies
 */
export function createLearningJournalHandler({
  store,
  getUserId,
  recordAudit = async () => {}
}) {
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
      const classroomId = classroomIdFromRequest(request);
      if (request.method === "GET") {
        sendJson(
          response,
          200,
          normalizeState(await store.getJournal(userId, classroomId))
        );
        return;
      }
      if (request.method === "PUT") {
        const raw = await readJsonBody(request);
        const input = normalizeInput(raw);
        if (!input) {
          sendJson(response, 400, {
            error: "Journal must contain only reviewed coarse learning outcomes."
          });
          return;
        }
        const journal = input.journal;
        const state = normalizeState(
          await store.saveJournal(
            userId,
            journal,
            input.clearGeneration,
            classroomId
          )
        );
        // Audit rows carry counts only. Journal minimization forbids storing
        // reviewed Question outcomes anywhere outside the Journal itself.
        await recordAudit(request, {
          actorId: userId,
          action: "journal.sync",
          resource: {
            type: "learning_journal",
            id: classroomId ? `${userId}:${classroomId}` : userId
          },
          after: {
            clearGeneration: state.clearGeneration,
            eventCount: state.journal.events.length
          }
        });
        sendJson(response, 200, state);
        return;
      }
      if (request.method === "DELETE") {
        const state = normalizeState(
          await store.clearJournal(userId, classroomId)
        );
        await recordAudit(request, {
          actorId: userId,
          action: "journal.clear",
          resource: {
            type: "learning_journal",
            id: classroomId ? `${userId}:${classroomId}` : userId
          },
          after: { clearGeneration: state.clearGeneration }
        });
        sendJson(response, 200, state);
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
      if (error instanceof ClassroomContextError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      if (error instanceof ClassroomAccessDeniedError) {
        sendJson(response, 403, { error: error.message });
        return;
      }
      if (error instanceof JournalClearConflictError) {
        sendJson(response, 409, {
          error: error.message,
          clearGeneration: error.clearGeneration
        });
        return;
      }
      if (error instanceof DeletedUserError) {
        sendJson(response, 410, {
          error: "This account has been deleted."
        });
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
function hasExactJournalShape(value) {
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

/** @param {unknown} value */
function normalizeInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = /** @type {Record<string, unknown>} */ (value);
  if (
    Object.keys(input).sort().join(",") !== "clearGeneration,journal" ||
    !Number.isSafeInteger(input.clearGeneration) ||
    Number(input.clearGeneration) < 0 ||
    !hasExactJournalShape(input.journal)
  ) {
    return null;
  }
  const journal = normalizeLanternJournal(input.journal);
  return journal
    ? { journal, clearGeneration: Number(input.clearGeneration) }
    : null;
}

/** @param {unknown} value */
function normalizeState(value) {
  const state =
    value && typeof value === "object" && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : {};
  return {
    journal:
      normalizeLanternJournal(state.journal) ?? createLanternJournal(),
    clearGeneration:
      Number.isSafeInteger(state.clearGeneration) &&
      Number(state.clearGeneration) >= 0
        ? Number(state.clearGeneration)
        : 0
  };
}

/** @param {import("node:http").IncomingMessage} request */
async function readJsonBody(request) {
  /** @type {Buffer[]} */
  const chunks = [];
  let bodyBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bodyBytes += buffer.length;
    if (bodyBytes > MAX_BODY_BYTES) {
      throw new JournalInputError("Journal request is too large.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new JournalInputError("Journal request must be valid JSON.");
  }
}

/** @param {import("node:http").ServerResponse} response @param {number} status @param {unknown} body */
function sendJson(response, status, body) {
  response.statusCode = status;
  setRetryAfter(response, status);
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

class JournalInputError extends Error {}

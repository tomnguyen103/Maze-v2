import { URL } from "node:url";
import {
  InputError,
  validateCloudQuestWrite
} from "./quest-progress-validation.js";
import { safeErrorName } from "./safe-error-log.js";

export const QUEST_PROGRESS_PATHS = new Set(["/api/quest-progress"]);
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * @param {{
 *   store: {
 *     get: (userId: string) => Promise<unknown>,
 *     save: (userId: string, expectedRevision: number, progress: NonNullable<ReturnType<typeof import("../src/game/quest-progress.js").normalizeQuestProgress>>) => Promise<{ record: unknown, conflict: boolean, duplicate: boolean }>
 *   },
 *   getUserId: (request: import("node:http").IncomingMessage) => string | null | Promise<string | null>
 * }} dependencies
 */
export function createQuestProgressHandler({ store, getUserId }) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function questProgressHandler(request, response, next) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!QUEST_PROGRESS_PATHS.has(pathname)) {
      next?.();
      return;
    }
    try {
      const userId = await getUserId(request);
      if (!userId) {
        sendJson(response, 401, { error: "Sign in to continue." });
        return;
      }
      if (request.method === "GET") {
        sendJson(response, 200, { record: await store.get(userId) });
        return;
      }
      if (request.method !== "PUT") {
        response.setHeader("allow", "GET, PUT");
        sendJson(response, 405, {
          error: "Use GET or PUT for Cloud Quest Progress."
        });
        return;
      }
      const { expectedRevision, progress } = validateCloudQuestWrite(
        await readJsonBody(request)
      );
      const result = await store.save(userId, expectedRevision, progress);
      if (result.conflict) {
        sendJson(response, 409, {
          error: "Cloud Quest Progress changed on another device.",
          record: result.record
        });
        return;
      }
      sendJson(
        response,
        expectedRevision === 0 && !result.duplicate ? 201 : 200,
        {
          record: result.record,
          duplicate: result.duplicate
        }
      );
    } catch (error) {
      if (error instanceof InputError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      console.error("[quest-progress] API request failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 500, {
        error: "Cloud Quest Progress is unavailable. Local play still works."
      });
    }
  };
}

/** @param {import("node:http").IncomingMessage} request */
async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new InputError("Quest Progress request body is too large.");
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new InputError("Request body must be valid JSON.");
  }
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

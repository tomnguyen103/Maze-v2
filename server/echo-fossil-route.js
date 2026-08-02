import { URL } from "node:url";
import {
  normalizeFossilCollection
} from "../src/game/quest-fossils.js";
import { DeletedUserError } from "./deleted-user-guard.js";
import { safeErrorName } from "./safe-error-log.js";

export const ECHO_FOSSIL_PATH = "/api/echo-fossils";
const MAX_BODY_BYTES = 128 * 1024;
const QUEST_ID_PATTERN = /^quest_[a-z0-9_-]{7,92}$/i;

/**
 * @param {{
 *   store: {
 *     getFossils: (userId: string, questId: string) => Promise<{ collection: unknown }>,
 *     saveFossils: (userId: string, collection: unknown) => Promise<{ collection: unknown }>
 *   },
 *   getUserId: (request: import("node:http").IncomingMessage) => string | null | Promise<string | null>,
 *   recordAudit?: import("./audit.js").RecordAudit
 * }} dependencies
 */
export function createEchoFossilHandler({
  store,
  getUserId,
  recordAudit = async () => {}
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function echoFossilHandler(request, response, next) {
    const url = new URL(request.url ?? "", "http://local");
    if (url.pathname !== ECHO_FOSSIL_PATH) {
      next?.();
      return;
    }
    try {
      if (hasClassroomScope(request)) {
        throw new FossilInputError(
          "Echo Fossils are available only for Personal Play."
        );
      }
      const userId = await getUserId(request);
      if (!userId) {
        sendJson(response, 401, {
          error: "Sign in to sync Echo Fossils."
        });
        return;
      }
      if (request.method === "GET") {
        const questId = questIdFromUrl(url);
        sendJson(response, 200, await store.getFossils(userId, questId));
        return;
      }
      if (request.method !== "PUT") {
        response.setHeader("allow", "GET, PUT");
        sendJson(response, 405, {
          error: "Use GET or PUT for Echo Fossil memory."
        });
        return;
      }
      const input = normalizeInput(await readJsonBody(request));
      if (!input) {
        throw new FossilInputError(
          "Echo Fossil memory must contain only reviewed coarse outcomes."
        );
      }
      const state = await store.saveFossils(userId, input.collection);
      const collection = normalizeFossilCollection(state?.collection);
      if (!collection) {
        throw new Error("Echo Fossil service returned invalid memory.");
      }
      await recordAudit(request, {
        actorId: userId,
        action: "echo_fossil.sync",
        resource: { type: "echo_fossil_collection", id: userId },
        after: {
          questId: collection.questId,
          fossilCount: collection.fossils.length
        }
      });
      sendJson(response, 200, { collection });
    } catch (error) {
      if (error instanceof FossilInputError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      if (error instanceof DeletedUserError) {
        sendJson(response, 410, { error: "This account has been deleted." });
        return;
      }
      console.error("[echo-fossil] API request failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 500, {
        error: "Echo Fossil cloud sync is unavailable. Local memory still works."
      });
    }
  };
}

/** @param {import("node:http").IncomingMessage} request */
function hasClassroomScope(request) {
  const value = request.headers["x-echo-maze-classroom-id"];
  return typeof value === "string" && value.length > 0;
}

/** @param {URL} url */
function questIdFromUrl(url) {
  const questId = url.searchParams.get("questId");
  if (!questId || !QUEST_ID_PATTERN.test(questId)) {
    throw new FossilInputError("A valid Quest ID is required.");
  }
  return questId;
}

/** @param {unknown} value */
function normalizeInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const input = /** @type {Record<string, unknown>} */ (value);
  if (Object.keys(input).sort().join(",") !== "collection") {
    return null;
  }
  const collection = normalizeFossilCollection(input.collection);
  return collection ? { collection } : null;
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
      throw new FossilInputError("Echo Fossil request is too large.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new FossilInputError("Echo Fossil request must be valid JSON.");
  }
}

/** @param {import("node:http").ServerResponse} response @param {number} status @param {unknown} body */
function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

class FossilInputError extends Error {}

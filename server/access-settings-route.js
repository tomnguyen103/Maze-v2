import { URL } from "node:url";
import { answerDeletedUser } from "./deleted-user-guard.js";
import { safeErrorName } from "./safe-error-log.js";
import { setRetryAfter } from "./http-retry.js";

export const ACCESS_SETTINGS_PATH = "/api/me/settings";
const MAX_BODY_BYTES = 4096;
const SETTING_KEYS = new Set([
  "version",
  "highContrast",
  "largeMarks",
  "readerFriendlyQuestions",
  "reducedEffects",
  "trailCompassEnabled",
  "narrationPace"
]);
const NARRATION_PACES = new Set(["standard", "slower", "faster"]);

class AccessSettingsInputError extends Error {}

/**
 * @typedef {{
 *   version: 2,
 *   highContrast: boolean,
 *   largeMarks: boolean,
 *   readerFriendlyQuestions: boolean,
 *   reducedEffects: boolean,
 *   trailCompassEnabled: boolean,
 *   narrationPace: "standard" | "slower" | "faster"
 * }} AccessSettings
 */

/**
 * @param {{
 *   store: {
 *     get: (userId: string) => Promise<unknown>,
 *     save: (
 *       userId: string,
 *       expectedRevision: number,
 *       settings: AccessSettings
 *     ) => Promise<{ record: unknown, conflict: boolean, duplicate: boolean }>
 *   },
 *   getUserId: (
 *     request: import("node:http").IncomingMessage
 *   ) => string | null | Promise<string | null>,
 *   recordAudit?: import("./audit.js").RecordAudit
 * }} dependencies
 */
export function createAccessSettingsHandler({
  store,
  getUserId,
  recordAudit = async () => {}
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function accessSettingsHandler(request, response, next) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (pathname !== ACCESS_SETTINGS_PATH) {
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
          error: "Use GET or PUT for Explorer Access Settings."
        });
        return;
      }

      const { expectedRevision, settings } = validateWrite(
        await readJsonBody(request)
      );
      const result = await store.save(userId, expectedRevision, settings);
      if (result.conflict) {
        sendJson(response, 409, {
          error: "Explorer Access Settings changed on another device.",
          record: result.record
        });
        return;
      }
      if (!result.duplicate) {
        await recordAudit(request, {
          actorId: userId,
          action: "access_settings.save",
          resource: { type: "explorer_access_settings", id: userId },
          before: { expectedRevision },
          after: settings
        });
      }
      sendJson(
        response,
        expectedRevision === 0 && !result.duplicate ? 201 : 200,
        { record: result.record, duplicate: result.duplicate }
      );
    } catch (error) {
      if (error instanceof AccessSettingsInputError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      if (answerDeletedUser(error, response)) {
        return;
      }
      console.error("[access-settings] API request failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 500, {
        error: "Explorer Access Settings sync is unavailable."
      });
    }
  };
}

/** @param {unknown} value */
function validateWrite(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccessSettingsInputError("Request body is invalid.");
  }
  const body = /** @type {Record<string, unknown>} */ (value);
  const expectedRevision = body.expectedRevision;
  const settings = body.settings;
  if (
    !Number.isSafeInteger(expectedRevision) ||
    Number(expectedRevision) < 0
  ) {
    throw new AccessSettingsInputError(
      "expectedRevision must be a non-negative safe integer."
    );
  }
  if (
    !settings ||
    typeof settings !== "object" ||
    Array.isArray(settings)
  ) {
    throw new AccessSettingsInputError("settings must be an object.");
  }
  const candidate = /** @type {Record<string, unknown>} */ (settings);
  if (
    Object.keys(candidate).some((key) => !SETTING_KEYS.has(key)) ||
    candidate.version !== 2 ||
    typeof candidate.highContrast !== "boolean" ||
    typeof candidate.largeMarks !== "boolean" ||
    typeof candidate.readerFriendlyQuestions !== "boolean" ||
    typeof candidate.reducedEffects !== "boolean" ||
    typeof candidate.trailCompassEnabled !== "boolean" ||
    // Membership is checked on the raw value: coercing first would let a
    // one-element array like ["standard"] pass and then persist unchanged,
    // failing the client's strict check later.
    typeof candidate.narrationPace !== "string" ||
    !NARRATION_PACES.has(candidate.narrationPace)
  ) {
    throw new AccessSettingsInputError(
      "Explorer Access Settings are invalid."
    );
  }
  return {
    expectedRevision: Number(expectedRevision),
    settings: /** @type {AccessSettings} */ (candidate)
  };
}

/** @param {import("node:http").IncomingMessage} request */
async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new AccessSettingsInputError(
        "Explorer Access Settings request body is too large."
      );
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new AccessSettingsInputError("Request body must be valid JSON.");
  }
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

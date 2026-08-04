import { URL } from "node:url";
import { classroomIdFromRequest } from "./classroom-context.js";
import { UNMETERED } from "./rate-limit-config.js";
import { safeErrorName } from "./safe-error-log.js";
import { sendRateLimited } from "./rate-limit-request.js";
import { RUN_REPLAY_LIMITS } from "./run-replay.js";
import { setRetryAfter } from "./http-retry.js";

/**
 * @typedef {import("../shared/offline-receipt.js").OfflineReceipt} OfflineReceipt
 * @typedef {{
 *   idempotencyKey: string,
 *   receipt: OfflineReceipt,
 *   deviceInstallationHash: string,
 *   contentPackHash: string,
 *   terminalAt: string,
 *   actionLog: unknown,
 *   playerId?: string
 * }} OfflineSubmissionInput
 */

export const OFFLINE_SUBMISSION_PATH = "/api/offline/submission";
export const OFFLINE_SUBMISSION_PATHS = new Set([OFFLINE_SUBMISSION_PATH]);

// The action log is bounded to 512 KiB. The remaining allowance covers the
// signed receipt and the small protocol envelope without making the endpoint
// an arbitrary JSON upload surface.
const MAX_BODY_BYTES = RUN_REPLAY_LIMITS.maxOfflineBytes + 128 * 1024;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_REASONS = new Set([
  "binding",
  "content-pack",
  "idempotency-key",
  "key",
  "play",
  "replay",
  "schema",
  "signature",
  "submission",
  "terminal-time",
  "unknown-run"
]);

/** @param {import("node:http").ServerResponse} response */
function noStore(response) {
  response.setHeader("cache-control", "no-store");
}

/** @param {import("node:http").ServerResponse} response @param {number} status @param {unknown} body */
function sendJson(response, status, body) {
  response.statusCode = status;
  setRetryAfter(response, status);
  response.setHeader("content-type", "application/json; charset=utf-8");
  noStore(response);
  response.end(JSON.stringify(body));
}

class SubmissionInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "SubmissionInputError";
  }
}

/** @param {import("node:http").IncomingMessage} request */
async function readSubmissionRequest(request) {
  /** @type {Buffer[]} */
  const chunks = [];
  let bodyBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bodyBytes += buffer.length;
    if (bodyBytes > MAX_BODY_BYTES) {
      throw new SubmissionInputError("Submission request is too large.");
    }
    chunks.push(buffer);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SubmissionInputError("Submission request must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SubmissionInputError("Submission request is invalid.");
  }
  const input = /** @type {Record<string, unknown>} */ (parsed);
  if (
    typeof input.idempotencyKey !== "string" ||
    typeof input.receipt !== "object" ||
    input.receipt === null ||
    Array.isArray(input.receipt) ||
    typeof input.deviceInstallationHash !== "string" ||
    !HASH_PATTERN.test(input.deviceInstallationHash) ||
    typeof input.contentPackHash !== "string" ||
    !HASH_PATTERN.test(input.contentPackHash) ||
    typeof input.terminalAt !== "string" ||
    !Number.isFinite(Date.parse(input.terminalAt)) ||
    !input.actionLog ||
    typeof input.actionLog !== "object" ||
    Array.isArray(input.actionLog)
  ) {
    throw new SubmissionInputError("Submission package is invalid.");
  }
  return {
    idempotencyKey: input.idempotencyKey,
    receipt: /** @type {OfflineReceipt} */ (input.receipt),
    deviceInstallationHash: input.deviceInstallationHash,
    contentPackHash: input.contentPackHash,
    terminalAt: input.terminalAt,
    actionLog: input.actionLog
  };
}

/** @param {Record<string, unknown>} result */
function publicReplayResult(result) {
  const allowed = [
    "status",
    "seed",
    "score",
    "wardensDefeated",
    "echoesCollected",
    "moves",
    "elapsedMs"
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => result[key] !== undefined)
      .map((key) => [key, result[key]])
  );
}

/**
 * @param {{
 *   getUserId: (request: import("node:http").IncomingMessage) => string | null | Promise<string | null>,
 *   submit: (submission: OfflineSubmissionInput) => Promise<{
 *     status: "accepted" | "rejected" | "expired" | "invalid",
 *     duplicate: boolean,
 *     result?: Record<string, unknown>,
 *     reason?: string
 *   }>,
 *   classroomIdFor?: (request: import("node:http").IncomingMessage) => string | null,
 *   rateLimit?: import("./rate-limit-request.js").RateLimit
 * }} dependencies
 */
export function createOfflineSubmissionHandler({
  getUserId,
  submit,
  classroomIdFor = classroomIdFromRequest,
  rateLimit = async () => UNMETERED
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function offlineSubmissionHandler(
    request,
    response,
    next = undefined
  ) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!OFFLINE_SUBMISSION_PATHS.has(pathname)) {
      next?.();
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, {
        error: "Use POST for Offline Run submission."
      });
      return;
    }
    try {
      const userId = await getUserId(request);
      if (!userId) {
        sendJson(response, 401, { error: "Sign in to continue." });
        return;
      }
      if (classroomIdFor(request)) {
        sendJson(response, 403, {
          error: "Classroom Runs cannot be submitted offline."
        });
        return;
      }
      const decision = await rateLimit("offline.submit", request, userId);
      if (!decision.allowed) {
        sendRateLimited(
          response,
          decision,
          "Too many Offline Run submissions. Try again shortly."
        );
        return;
      }
      const submission = await readSubmissionRequest(request);
      const outcome = await submit({ ...submission, playerId: userId });
      const body = {
        status: outcome.status,
        duplicate: outcome.duplicate === true,
        ...(SAFE_REASONS.has(String(outcome.reason))
          ? { reason: outcome.reason }
          : {}),
        ...(outcome.result
          ? { result: publicReplayResult(outcome.result) }
          : {})
      };
      sendJson(response, 200, body);
    } catch (error) {
      if (error instanceof SubmissionInputError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      console.error("[offline-submission] API request failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 503, {
        error: "Offline Run submission is temporarily unavailable."
      });
    }
  };
}

/** @param {string} [message] */
export function createUnavailableOfflineSubmissionHandler(
  message = "Offline Run submission is not configured."
) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function unavailableOfflineSubmissionHandler(
    request,
    response,
    next = undefined
  ) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!OFFLINE_SUBMISSION_PATHS.has(pathname)) {
      next?.();
      return;
    }
    sendJson(response, 503, { error: message });
  };
}

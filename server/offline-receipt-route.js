import { URL } from "node:url";
import { classroomIdFromRequest } from "./classroom-context.js";
import { getQuestRunRuleset } from "../src/game/run-ruleset.js";
import { offlineReceiptWindows } from "../shared/offline-receipt.js";
import { getQuestContentPackId, QUEST_II_CONTENT_PACK_ID } from "../src/game/quest-content.js";
import { validateOfflineDeviceInstallationNonce } from "./offline-device.js";
import { validateRunRequest } from "./run-access-route.js";
import { setRetryAfter } from "./http-retry.js";

export const OFFLINE_RECEIPT_PATH = "/api/offline/receipt";
export const OFFLINE_RECEIPT_PATHS = new Set([OFFLINE_RECEIPT_PATH]);

const MAX_BODY_BYTES = 8 * 1024;

/** @typedef {"bright-start" | "trail-scout" | "maze-master"} OfflineLevelId */
/** @typedef {{
 *   runId: string,
 *   playerId: string | null,
 *   questId?: string,
 *   deviceInstallationHash: string,
 *   seed: string,
 *   levelId: OfflineLevelId,
 *   labyrinthNumber: number,
 *   rulesetRevision: string,
 *   contentPackHash: string,
 *   learningDeckId?: string,
 *   learningDeckRevision?: string,
 *   initialQuestionOrdinal?: number,
 *   initialUsedQuestionIds?: string[]
 * }} OfflineReceiptFields */
/** @typedef {OfflineReceiptFields & {
 *   issuedAt: string,
 *   playExpiresAt: string,
 *   submissionExpiresAt: string
 * }} OfflineStoredReceipt */
/** @typedef {OfflineReceiptFields & { classroomId: string | null, questId: string }} OfflineReceiptAdmission */

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

/** @param {import("node:http").IncomingMessage} request */
async function readReceiptRequest(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
  const input =
    parsed && typeof parsed === "object"
      ? /** @type {Record<string, unknown>} */ (parsed)
      : {};
  if (
    typeof input.questId !== "string" ||
    !/^(quest|legacy)_[A-Za-z0-9_-]{7,92}$/.test(input.questId)
  ) {
    throw new Error("Quest ID is invalid.");
  }
  return {
    ...validateRunRequest(input),
    questId: input.questId,
    deviceInstallationNonce: validateOfflineDeviceInstallationNonce(
      input.deviceInstallationNonce
    )
  };
}

/**
 * @param {{
 *   getUserId: (request: import("node:http").IncomingMessage) => string | null | Promise<string | null>,
 *   getRunGrant: (userId: string, runId: string) => Promise<{
 *     runId: string,
 *     seed: string,
 *     levelId: string,
 *     labyrinthNumber: number
 *   } | null>,
 *   issueReceipt: (binding: OfflineStoredReceipt) => Promise<boolean>,
 *   readReceipt: (userId: string, runId: string, deviceHash: string) => Promise<{
 *     runId: string,
 *     playerId: string | null,
 *     questId?: string,
 *     deviceInstallationHash: string,
 *     seed: string,
 *     levelId: string,
 *     labyrinthNumber: number,
 *     rulesetRevision: string,
 *     contentPackHash: string,
 *     issuedAt: string | Date,
 *     playExpiresAt: string | Date,
 *     submissionExpiresAt: string | Date,
 *     learningDeckId?: string,
 *     learningDeckRevision?: string,
 *     initialQuestionOrdinal?: number,
 *     initialUsedQuestionIds?: string[]
 *   } | null>,
 *   getQuestProgress?: (userId: string) => Promise<{
 *     questId: string,
 *     levelId: string,
 *     labyrinthNumber: number,
 *     learningDeckId: string,
 *     learningDeckRevision: string,
 *     nextQuestionOrdinal: number,
 *     usedQuestionIds: string[]
 *   } | null>,
 *   signer: { issue: (admission: OfflineReceiptAdmission, options?: { issuedAt?: string }) => Record<string, unknown> },
 *   deviceHashFor: (nonce: string) => string,
 *   contentPackHash: string,
 *   assetPackage: { version: string, assets: { url: string, scope: "public" | "account" }[] },
 *   classroomIdFor?: (request: import("node:http").IncomingMessage) => string | null,
 *   rulesetFor?: (run: { labyrinthNumber: number }) => { revision: string },
 *   now?: () => Date
 * }} dependencies
 */
export function createOfflineReceiptHandler({
  getUserId,
  getRunGrant,
  issueReceipt,
  readReceipt,
  getQuestProgress,
  signer,
  deviceHashFor,
  contentPackHash,
  assetPackage,
  classroomIdFor = classroomIdFromRequest,
  rulesetFor = (run) => getQuestRunRuleset(run.labyrinthNumber),
  now = () => new Date()
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} next
   */
  return async function offlineReceiptHandler(request, response, next = undefined) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!OFFLINE_RECEIPT_PATHS.has(pathname)) {
      next?.();
      return;
    }
    try {
      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        sendJson(response, 405, { error: "Use POST for Offline Continuity." });
        return;
      }
      const input = await readReceiptRequest(request);
      const userId = await getUserId(request);
      if (!userId) {
        sendJson(response, 401, { error: "Sign in to continue." });
        return;
      }
      if (classroomIdFor(request)) {
        sendJson(response, 403, {
          error: "Classroom Runs cannot continue offline."
        });
        return;
      }
      const grant = await getRunGrant(userId, input.runId);
      if (
        !grant ||
        grant.runId !== input.runId ||
        grant.seed !== input.seed ||
        grant.levelId !== input.levelId ||
        Number(grant.labyrinthNumber) !== input.labyrinthNumber
      ) {
        sendJson(response, 409, {
          error: "The Run is not admitted for Offline Continuity."
        });
        return;
      }
      let questBinding = null;
      if (!getQuestProgress) {
        sendJson(response, 503, {
          error: "The Quest Progress is not ready for Offline Continuity."
        });
        return;
      }
      const progress = await getQuestProgress(userId);
      if (
        !progress ||
        typeof progress.questId !== "string" ||
        progress.questId !== input.questId ||
        progress.levelId !== grant.levelId ||
        Number(progress.labyrinthNumber) !== Number(grant.labyrinthNumber) ||
        typeof progress.learningDeckId !== "string" ||
        typeof progress.learningDeckRevision !== "string" ||
        !Number.isSafeInteger(progress.nextQuestionOrdinal) ||
        !Array.isArray(progress.usedQuestionIds) ||
        progress.usedQuestionIds.some((id) => typeof id !== "string")
      ) {
        sendJson(response, 409, {
          error: "The Quest Progress is not ready for Offline Continuity."
        });
        return;
      }
      questBinding = {
        questId: progress.questId,
        learningDeckId: progress.learningDeckId,
        learningDeckRevision: progress.learningDeckRevision,
        initialQuestionOrdinal: progress.nextQuestionOrdinal,
        initialUsedQuestionIds: [...progress.usedQuestionIds]
      };
      const deviceInstallationHash = deviceHashFor(input.deviceInstallationNonce);
      const rulesetRevision = rulesetFor(input).revision;
      const issuedAt = now().toISOString();
      const windows = offlineReceiptWindows(issuedAt);
      const issued = await issueReceipt({
        runId: input.runId,
        playerId: userId,
        deviceInstallationHash,
        seed: input.seed,
        levelId: input.levelId,
        labyrinthNumber: input.labyrinthNumber,
        rulesetRevision,
        contentPackHash,
        issuedAt,
        ...windows,
        ...(questBinding ?? {})
      });
      const stored = await readReceipt(
        userId,
        input.runId,
        deviceInstallationHash
      );
      if (
        stored &&
        stored.deviceInstallationHash !== deviceInstallationHash
      ) {
        sendJson(response, 409, {
          error: "The Run is already bound to another device."
        });
        return;
      }
      if (
        stored &&
        !questIdentityMatches(stored.questId, input.questId)
      ) {
        sendJson(response, 409, {
          error: "The Run is bound to another Quest."
        });
        return;
      }
      if (!stored) {
        sendJson(
          response,
          issued ? 503 : 409,
          issued
            ? { error: "Offline Continuity could not persist this Run." }
            : { error: "The Run is already bound to another device." }
        );
        return;
      }
      const storedQuestId = stored.questId ?? input.questId;
      const receipt = signer.issue(
        {
          runId: stored.runId,
          playerId: stored.playerId,
          classroomId: null,
          questId: storedQuestId,
          deviceInstallationHash: stored.deviceInstallationHash,
          seed: stored.seed,
          levelId: /** @type {OfflineLevelId} */ (stored.levelId),
          labyrinthNumber: Number(stored.labyrinthNumber),
          rulesetRevision: stored.rulesetRevision,
          contentPackHash: stored.contentPackHash,
          ...(typeof stored.learningDeckId === "string"
            ? {
                learningDeckId: stored.learningDeckId,
                learningDeckRevision: stored.learningDeckRevision,
                initialQuestionOrdinal: stored.initialQuestionOrdinal,
                initialUsedQuestionIds: stored.initialUsedQuestionIds
              }
            : {})
        },
        { issuedAt: new Date(stored.issuedAt).toISOString() }
      );
      sendJson(response, issued ? 201 : 200, { receipt, assetPackage });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("Request body") ||
          error.message.startsWith("Run ") ||
          error.message.startsWith("Quest ") ||
          error.message.startsWith("Labyrinth ") ||
          error.message.startsWith("Device installation nonce"))
      ) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      if (error instanceof Error && error.name === "ClassroomContextError") {
        sendJson(response, 400, { error: error.message });
        return;
      }
      sendJson(response, 503, {
        error: "Offline Continuity could not be issued. Try again."
      });
    }
  };
}

/** @param {string | undefined} left @param {string} right */
function questIdentityMatches(left, right) {
  return (
    left === right ||
    (left === undefined &&
      getQuestContentPackId(right) !== QUEST_II_CONTENT_PACK_ID) ||
    (right === undefined &&
      getQuestContentPackId(left) !== QUEST_II_CONTENT_PACK_ID)
  );
}

/** @param {string} [message] */
export function createUnavailableOfflineReceiptHandler(
  message = "Offline Continuity is not configured."
) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function unavailableOfflineReceiptHandler(
    request,
    response,
    next = undefined
  ) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!OFFLINE_RECEIPT_PATHS.has(pathname)) {
      next?.();
      return;
    }
    sendJson(response, 503, { error: message });
  };
}

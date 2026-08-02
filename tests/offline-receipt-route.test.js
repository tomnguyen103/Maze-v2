import { generateKeyPairSync } from "node:crypto";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createOfflineReceiptSigner } from "../server/offline-receipt.js";
import {
  createOfflineReceiptHandler,
  OFFLINE_RECEIPT_PATH
} from "../server/offline-receipt-route.js";

/** @type {{ runId: string, seed: string, levelId: "trail-scout", labyrinthNumber: number }} */
const RUN = {
  runId: "access_01J1MOSSWATCH",
  seed: "MOSS-WATCH-11",
  levelId: "trail-scout",
  labyrinthNumber: 4
};
const DEVICE_HASH = "a".repeat(64);
const CONTENT_PACK_HASH = "b".repeat(64);
/** @type {{ version: string, assets: { url: string, scope: "public" | "account" }[] }} */
const ASSET_PACKAGE = {
  version: "build_01J1MOSSWATCH",
  assets: [
    { url: "/index.html", scope: "public" },
    { url: "/assets/quest-pack.js", scope: "account" }
  ]
};
/** @typedef {{
 *   runId: string,
 *   playerId: string | null,
 *   questId?: string,
 *   deviceInstallationHash: string,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   rulesetRevision: string,
 *   contentPackHash: string,
 *   learningDeckId?: string,
 *   learningDeckRevision?: string,
 *   initialQuestionOrdinal?: number,
 *   initialUsedQuestionIds?: string[],
 *   issuedAt: string,
 *   playExpiresAt: string,
 *   submissionExpiresAt: string
 * }} StoredReceipt */

/**
 * @param {Record<string, unknown>} body
 * @param {Record<string, string>} [headers]
 * @returns {import("node:http").IncomingMessage}
 */
function request(body, headers = {}) {
  const input = /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ (Readable.from([JSON.stringify(body)]))
  );
  input.method = "POST";
  input.url = OFFLINE_RECEIPT_PATH;
  input.headers = headers;
  return input;
}

function response() {
  const headers = new Map();
  let payload = "";
  const output = /** @type {import("node:http").ServerResponse} */ (
    /** @type {unknown} */ ({
    statusCode: 0,
    setHeader(
      /** @type {string} */ name,
      /** @type {string | number | string[]} */ value
    ) {
      headers.set(name.toLowerCase(), value);
    },
    end(/** @type {string | Uint8Array} */ value = "") {
      payload = String(value);
    }
  })
  );
  return {
    output,
    headers,
    body: () => JSON.parse(payload)
  };
}

/** @typedef {{ questId: string, levelId: string, labyrinthNumber: number, learningDeckId: string, learningDeckRevision: string, nextQuestionOrdinal: number, usedQuestionIds: string[] }} QuestProgress */

const DEFAULT_QUEST_PROGRESS = {
  questId: "quest_01MOSS123",
  levelId: RUN.levelId,
  labyrinthNumber: RUN.labyrinthNumber,
  learningDeckId: "mixed-trail",
  learningDeckRevision:
    "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92",
  nextQuestionOrdinal: 0,
  usedQuestionIds: []
};

/** @param {{ grant?: typeof RUN | null, userId?: string, questProgress?: QuestProgress | null }} [options] */
function createHarness({
  grant = RUN,
  userId = "user_01MOSS",
  questProgress = DEFAULT_QUEST_PROGRESS
} = {}) {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const signer = createOfflineReceiptSigner({
    privateKey: pair.privateKey,
    keyId: "offline-test"
  });
  /** @type {StoredReceipt | null} */
  let stored = null;
  const issueReceipt = vi.fn(
    /** @param {Record<string, unknown>} binding */
    async (binding) => {
    if (stored) {
      return false;
    }
    stored = /** @type {StoredReceipt} */ ({ ...binding });
    return true;
    }
  );
  const readReceipt = vi.fn(async () => stored);
  const handler = createOfflineReceiptHandler({
    getUserId: async () => userId,
    getRunGrant: vi.fn(async () => grant),
    issueReceipt,
    readReceipt,
    getQuestProgress: async () => questProgress,
    signer,
    deviceHashFor: () => DEVICE_HASH,
    contentPackHash: CONTENT_PACK_HASH,
    assetPackage: ASSET_PACKAGE,
    now: () => new Date("2026-08-01T12:00:00.000Z")
  });
  return { handler, issueReceipt, readReceipt };
}

describe("Offline Continuity receipt route", () => {
  it("issues one exact Personal Run binding without echoing the nonce", async () => {
    const harness = createHarness();
    const nonce = "installation_nonce_01MOSS";
    const result = response();

    await harness.handler(
      request({ ...RUN, deviceInstallationNonce: nonce }),
      result.output
    );

    expect(result.output.statusCode).toBe(201);
    const body = result.body();
    expect(body).toMatchObject({ assetPackage: ASSET_PACKAGE });
    expect(body.receipt.binding).toMatchObject({
      runId: RUN.runId,
      playerId: "user_01MOSS",
      questId: "quest_01MOSS123",
      deviceInstallationHash: DEVICE_HASH,
      seed: RUN.seed,
      levelId: RUN.levelId,
      labyrinthNumber: RUN.labyrinthNumber,
      rulesetRevision: "echo-hush-v1",
      contentPackHash: CONTENT_PACK_HASH
    });
    expect(JSON.stringify(body)).not.toContain(nonce);
    expect(JSON.stringify(harness.issueReceipt.mock.calls[0][0])).not.toContain(
      nonce
    );
  });

  it("does not extend a receipt when the same Run is requested again", async () => {
    const harness = createHarness();
    const first = response();
    const second = response();
    const body = { ...RUN, deviceInstallationNonce: "installation_nonce_01MOSS" };

    await harness.handler(request(body), first.output);
    await harness.handler(request(body), second.output);

    expect(first.output.statusCode).toBe(201);
    expect(second.output.statusCode).toBe(200);
    expect(second.body().receipt.binding.issuedAt).toBe(
      first.body().receipt.binding.issuedAt
    );
    expect(harness.issueReceipt).toHaveBeenCalledTimes(2);
  });

  it("signs the Quest Deck cursor into the receipt binding", async () => {
    const harness = createHarness({
      questProgress: {
        questId: "quest_01MOSS123",
        levelId: RUN.levelId,
        labyrinthNumber: RUN.labyrinthNumber,
        learningDeckId: "number-trail",
        learningDeckRevision:
          "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105",
        nextQuestionOrdinal: 7,
        usedQuestionIds: ["bright-foundation-01"]
      }
    });
    const result = response();

    await harness.handler(
      request({ ...RUN, deviceInstallationNonce: "installation_nonce_01MOSS" }),
      result.output
    );

    expect(result.output.statusCode).toBe(201);
    expect(result.body().receipt.binding).toMatchObject({
      learningDeckId: "number-trail",
      learningDeckRevision:
        "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105",
      initialQuestionOrdinal: 7,
      initialUsedQuestionIds: ["bright-foundation-01"]
    });
    expect(harness.issueReceipt.mock.calls[0][0]).toMatchObject({
      learningDeckId: "number-trail",
      initialQuestionOrdinal: 7
    });
  });

  it("does not disclose a receipt to a second device on an idempotent retry", async () => {
    const harness = createHarness();
    const secondDevice = createOfflineReceiptHandler({
      getUserId: async () => "user_01MOSS",
      getRunGrant: async () => RUN,
      issueReceipt: harness.issueReceipt,
      readReceipt: harness.readReceipt,
      getQuestProgress: async () => DEFAULT_QUEST_PROGRESS,
      signer: createOfflineReceiptSigner({
        privateKey: generateKeyPairSync("ec", { namedCurve: "prime256v1" })
          .privateKey,
        keyId: "offline-test"
      }),
      deviceHashFor: () => "c".repeat(64),
      contentPackHash: CONTENT_PACK_HASH,
      assetPackage: ASSET_PACKAGE,
      now: () => new Date("2026-08-01T12:00:00.000Z")
    });
    const first = response();
    const second = response();

    await harness.handler(
      request({ ...RUN, deviceInstallationNonce: "installation_nonce_01MOSS" }),
      first.output
    );
    await secondDevice(
      request({ ...RUN, deviceInstallationNonce: "installation_nonce_02MOSS" }),
      second.output
    );

    expect(first.output.statusCode).toBe(201);
    expect(second.output.statusCode).toBe(409);
    expect(second.body()).toEqual({
      error: "The Run is already bound to another device."
    });
  });

  it("fails closed for Classroom, malformed, and ungranted Runs", async () => {
    const classroom = createHarness();
    const classroomResponse = response();
    await classroom.handler(
      request(
        { ...RUN, deviceInstallationNonce: "installation_nonce_01MOSS" },
        { "x-echo-maze-classroom-id": "org_classroom" }
      ),
      classroomResponse.output
    );
    expect(classroomResponse.output.statusCode).toBe(403);

    const malformed = createHarness();
    const malformedResponse = response();
    await malformed.handler(
      request({ ...RUN, deviceInstallationNonce: "too-short" }),
      malformedResponse.output
    );
    expect(malformedResponse.output.statusCode).toBe(400);

    const ungranted = createHarness({ grant: null });
    const ungrantedResponse = response();
    await ungranted.handler(
      request({ ...RUN, deviceInstallationNonce: "installation_nonce_01MOSS" }),
      ungrantedResponse.output
    );
    expect(ungrantedResponse.output.statusCode).toBe(409);
  });
});

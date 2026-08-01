import { describe, expect, it, vi } from "vitest";
import {
  createOfflinePracticeSession,
  pinOfflinePracticeTrail
} from "../src/learning/offline-practice.js";
import {
  ownerMismatch,
  hasUnverifiedOfflineResult,
  OFFLINE_ACCOUNT_SCOPED_KEYS,
  OFFLINE_ACTION_LOG_KEY,
  OFFLINE_RECEIPT_KEY,
  OFFLINE_RUN_RECORD_KEY,
  scrubOfflineState
} from "../src/game/offline-local-scrub.js";
import { ACTIVE_RUN_RECOVERY_KEY } from "../src/game/local-recovery-scrub.js";

function trail(questionCount = 5) {
  return {
    learningObjectiveId: "counting-to-twenty",
    requiredQuestionCount: 3,
    questions: Array.from({ length: questionCount }, (_, index) => ({
      id: `bright-foundation-${index + 1}`
    }))
  };
}

/** @param {Record<string, string>} [seed] */
function fakeStorage(seed = {}) {
  const entries = new Map(Object.entries(seed));
  return {
    keys: () => [...entries.keys()],
    getItem: (/** @type {string} */ key) => entries.get(key) ?? null,
    setItem: (/** @type {string} */ key, /** @type {string} */ value) =>
      entries.set(key, value),
    removeItem: (/** @type {string} */ key) => entries.delete(key)
  };
}

describe("Offline Practice", () => {
  it("pins exactly one Trail of three required and up to two optional", () => {
    const pinned = pinOfflinePracticeTrail(trail());

    expect(pinned.questionIds).toHaveLength(5);
    expect(pinned.key).toContain("counting-to-twenty");
    expect(() => pinOfflinePracticeTrail(trail(2))).toThrow(
      "three required reviewed Questions"
    );
    expect(() => pinOfflinePracticeTrail(trail(6))).toThrow(
      "at most five reviewed Questions"
    );
  });

  it("keys the Practice pin apart from any Quest Run pin", () => {
    // ADR 0036 pins Quest assets until terminal while Practice is current-tab
    // only, so sharing one key would let a Practice lifetime disturb a
    // non-terminal Quest Run.
    const pinned = pinOfflinePracticeTrail(trail());

    expect(pinned.key.startsWith("echo-maze:offline-practice-trail")).toBe(true);
    expect(pinned.key).not.toContain("run");
  });

  it("cannot answer anything but the Question it is on", () => {
    const session = createOfflinePracticeSession(pinOfflinePracticeTrail(trail()));

    expect(session.currentQuestionId()).toBe("bright-foundation-1");
    expect(() => session.record("bright-foundation-4", "correct")).toThrow(
      "only answer its pinned Question"
    );
    session.record("bright-foundation-1", "correct");
    expect(session.currentQuestionId()).toBe("bright-foundation-2");
  });

  it("queues coarse outcomes only, never an option or reviewed text", () => {
    const session = createOfflinePracticeSession(pinOfflinePracticeTrail(trail()));

    session.record("bright-foundation-1", "correct");
    session.record("bright-foundation-2", "hint");
    session.record("bright-foundation-3", "skip");

    for (const event of session.pendingEvents()) {
      expect(Object.keys(event).sort()).toEqual([
        "outcome",
        "questionRevisionId"
      ]);
      expect(["correct", "wrong", "hint", "skip"]).toContain(event.outcome);
    }
    expect(JSON.stringify(session.pendingEvents())).not.toMatch(
      /optionId|answerId|prompt|choice/i
    );
  });

  it("syncs idempotently when the same tab reconnects", () => {
    const session = createOfflinePracticeSession(pinOfflinePracticeTrail(trail()));
    const journal = { recordLearningOutcome: vi.fn() };

    session.record("bright-foundation-1", "correct");
    session.record("bright-foundation-2", "wrong");

    expect(session.sync(journal)).toEqual({ synced: 2 });
    expect(journal.recordLearningOutcome).toHaveBeenCalledTimes(2);
    // A second reconnect in the same tab has nothing left to send.
    expect(session.sync(journal)).toEqual({ synced: 0 });
    expect(journal.recordLearningOutcome).toHaveBeenCalledTimes(2);
  });

  it("leaves nothing behind for a closed or refreshed tab to sync", () => {
    const session = createOfflinePracticeSession(pinOfflinePracticeTrail(trail()));
    session.record("bright-foundation-1", "correct");

    session.discard();

    expect(session.pendingEvents()).toEqual([]);
    expect(session.currentQuestionId()).toBe("bright-foundation-1");
    // The events never reached storage in the first place, which is what makes
    // the discard total rather than best-effort.
    const storage = fakeStorage();
    expect(storage.keys()).toEqual([]);
  });

  it("never touches Quest, score, Run Record, or shared state", () => {
    const session = createOfflinePracticeSession(pinOfflinePracticeTrail(trail()));
    const journal = { recordLearningOutcome: vi.fn() };
    session.record("bright-foundation-1", "correct");

    session.sync(journal);

    // The Lantern Journal is the only thing Practice can reach, and it reaches
    // it through one call with one shape.
    expect(journal.recordLearningOutcome).toHaveBeenCalledWith(
      {
        questionRevisionId: "bright-foundation-1",
        learningObjectiveId: "counting-to-twenty"
      },
      "correct"
    );
  });
});

describe("Offline sign-out cleanup", () => {
  function populated() {
    return fakeStorage({
      ...Object.fromEntries(
        OFFLINE_ACCOUNT_SCOPED_KEYS.map((key) => [key, "{}"])
      ),
      [ACTIVE_RUN_RECOVERY_KEY]: "{}",
      "echo-maze:public-shell": "kept",
      "echo-maze:first-light:v1": "seen"
    });
  }

  it("erases every account-scoped artefact, asserted per key", () => {
    const storage = populated();

    expect(scrubOfflineState(storage)).toBe(true);

    for (const key of OFFLINE_ACCOUNT_SCOPED_KEYS) {
      expect(storage.getItem(key)).toBeNull();
    }
    expect(storage.getItem(ACTIVE_RUN_RECOVERY_KEY)).toBeNull();
  });

  it("leaves public, non-account state alone", () => {
    const storage = populated();

    scrubOfflineState(storage);

    expect(storage.getItem("echo-maze:public-shell")).toBe("kept");
    expect(storage.getItem("echo-maze:first-light:v1")).toBe("seen");
  });

  it("leaves another account nothing to reuse or inspect", () => {
    const storage = fakeStorage({
      ...Object.fromEntries(
        OFFLINE_ACCOUNT_SCOPED_KEYS.map((key) => [key, "{}"])
      ),
      "echo-maze:offline-practice-trail:counting-to-twenty":
        JSON.stringify({ questionIds: ["bright-foundation-1"] }),
      [ACTIVE_RUN_RECOVERY_KEY]: "{}",
      "echo-maze:public-shell": "kept",
      "echo-maze:first-light:v1": "seen"
    });

    scrubOfflineState(storage);

    expect(storage.keys().sort()).toEqual([
      "echo-maze:first-light:v1",
      "echo-maze:public-shell"
    ]);
  });

  it("warns before sign-out when an unverified result would be lost", () => {
    expect(
      hasUnverifiedOfflineResult(
        fakeStorage({
          [OFFLINE_RUN_RECORD_KEY]: JSON.stringify({
            verification: "pending"
          })
        })
      )
    ).toBe(true);
    expect(
      hasUnverifiedOfflineResult(
        fakeStorage({ [OFFLINE_ACTION_LOG_KEY]: "{}" })
      )
    ).toBe(true);
    expect(
      hasUnverifiedOfflineResult(
        fakeStorage({
          [OFFLINE_RUN_RECORD_KEY]: JSON.stringify({
            verification: "verified"
          })
        })
      )
    ).toBe(false);
    expect(hasUnverifiedOfflineResult(fakeStorage())).toBe(false);
  });

  it("treats unreadable local state as unverified rather than silently fine", () => {
    expect(
      hasUnverifiedOfflineResult(
        fakeStorage({ [OFFLINE_RUN_RECORD_KEY]: "not json" })
      )
    ).toBe(true);
  });

  it("detects a receipt left by a different identity before startup reuse", () => {
    const receipt = JSON.stringify({ binding: { playerId: "user_previous" } });
    expect(
      ownerMismatch(
        "user_current",
        fakeStorage({ [OFFLINE_RECEIPT_KEY]: receipt })
      )
    ).toBe(true);
    expect(
      ownerMismatch(
        "user_previous",
        fakeStorage({ [OFFLINE_RECEIPT_KEY]: receipt })
      )
    ).toBe(false);
    expect(
      ownerMismatch(
        null,
        fakeStorage({ [OFFLINE_RECEIPT_KEY]: receipt })
      )
    ).toBe(true);
    expect(
      ownerMismatch(
        null,
        fakeStorage({
          [OFFLINE_RECEIPT_KEY]: JSON.stringify({ binding: { playerId: null } })
        })
      )
    ).toBe(false);
  });

  it("runs even when the offline chunk never loaded", async () => {
    // The module is reachable on its own, importing nothing from the offline
    // play chunk, which is the whole point of the Milestone 4 precedent.
    const source = await import("../src/game/offline-local-scrub.js");

    expect(typeof source.scrubOfflineState).toBe("function");
    expect(scrubOfflineState(populated())).toBe(true);
  });

  it("reports failure rather than claiming a cleanup it could not do", () => {
    const stubborn = {
      getItem: () => "{}",
      setItem: () => {},
      removeItem: () => {}
    };

    expect(scrubOfflineState(stubborn)).toBe(false);
  });
});

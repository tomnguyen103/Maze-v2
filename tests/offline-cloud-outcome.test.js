import { describe, expect, it, vi } from "vitest";
import { createOfflineCloudOutcomeApplier } from "../server/offline-cloud-outcome.js";
import { getBundledQuestion } from "../src/questions/question-bank.js";
import { createLanternJournal } from "../src/learning/lantern-journal.js";

const RECEIPT = {
  runId: "offline_run_01J1MOSSWATCH",
  playerId: "user_01MOSS",
  questId: "quest_01MOSS123",
  seed: "MOSS-WATCH-11",
  levelId: "trail-scout",
  labyrinthNumber: 4,
  rulesetRevision: "echo-hush-v1"
};

function harness() {
  const playerStore = { submitScore: vi.fn(async () => ({})) };
  let journal = createLanternJournal();
  const progress = /** @type {Parameters<typeof import("../src/game/quest-progress.js").advanceQuest>[0]} */ ({
    version: 2,
    questId: "quest_01MOSS123",
    levelId: "trail-scout",
    learningDeckId: "mixed-trail",
    learningDeckRevision: "mixed-trail-v1",
    labyrinthNumber: 4,
    completedLabyrinths: 3,
    usedMapFingerprints: [],
    usedQuestionIds: [],
    nextQuestionOrdinal: 0,
    complete: false
  });
  const questProgressStore = {
    get: vi.fn(async () => ({
      revision: 4,
      updatedAt: "2026-08-01T00:00:00.000Z",
      progress
    })),
    save: vi.fn(async () => ({}))
  };
  const learningJournalStore = {
    getJournal: vi.fn(async () => ({ journal, clearGeneration: 0 })),
    saveJournal: vi.fn(async (_userId, nextJournal) => {
      journal = nextJournal;
    })
  };
  const apply = createOfflineCloudOutcomeApplier({
    playerStore,
    questProgressStore,
    learningJournalStore
  });
  return { apply, playerStore, questProgressStore, learningJournalStore };
}

describe("Offline replay cloud boundary", () => {
  it("writes the score and Quest boundary only from the replayed result", async () => {
    const test = harness();
    await test.apply({
      runId: RECEIPT.runId,
      playerId: RECEIPT.playerId,
      receipt: RECEIPT,
      result: {
        status: "won",
        score: 900,
        wardensDefeated: 2,
        echoesCollected: 3,
        moves: 12,
        elapsedMs: 30000
      }
    });

    expect(test.playerStore.submitScore).toHaveBeenCalledWith(
      "user_01MOSS",
      expect.objectContaining({
        idempotencyKey: "offline_offline_run_01J1MOSSWATCH",
        score: 900,
        escaped: true
      }),
      null
    );
    expect(test.questProgressStore.save).toHaveBeenCalledOnce();
    expect(test.learningJournalStore.saveJournal).not.toHaveBeenCalled();
  });

  it("does not write a score or Quest boundary for a replayed loss", async () => {
    const test = harness();
    await test.apply({
      runId: RECEIPT.runId,
      playerId: RECEIPT.playerId,
      receipt: RECEIPT,
      result: {
        status: "lost",
        score: 120,
        wardensDefeated: 0,
        echoesCollected: 1,
        moves: 12,
        elapsedMs: 30000
      }
    });

    expect(test.playerStore.submitScore).not.toHaveBeenCalled();
    expect(test.questProgressStore.save).not.toHaveBeenCalled();
  });

  it("does not advance a different Quest at the same Labyrinth", async () => {
    const test = harness();

    await test.apply({
      runId: RECEIPT.runId,
      playerId: RECEIPT.playerId,
      receipt: { ...RECEIPT, questId: "quest_other_123" },
      result: {
        status: "won",
        score: 900,
        wardensDefeated: 2,
        echoesCollected: 3,
        moves: 12,
        elapsedMs: 30000
      }
    });

    expect(test.playerStore.submitScore).toHaveBeenCalledOnce();
    expect(test.questProgressStore.save).not.toHaveBeenCalled();
  });

  it("applies the compact Journal summary idempotently", async () => {
    const test = harness();
    const question = getBundledQuestion({
      levelId: "bright-start",
      seed: "offline-journal-summary",
      wardenId: 0,
      labyrinthNumber: 1,
      questionOrdinal: 0
    });
    /** @type {{
     *   status: "lost",
     *   score: number,
     *   wardensDefeated: number,
     *   echoesCollected: number,
     *   moves: number,
     *   elapsedMs: number,
     *   journalSummary: {
     *     topicId: string,
     *     learningObjectiveId: string,
     *     difficultyBand: string,
     *     outcome: "correct",
     *     count: number
     *   }[]
     * }} */
    const result = {
      status: "lost",
      score: 120,
      wardensDefeated: 0,
      echoesCollected: 1,
      moves: 12,
      elapsedMs: 30000,
      journalSummary: [
        {
          topicId: question.topicId,
          learningObjectiveId: question.learningObjectiveId,
          difficultyBand: question.difficultyBand,
          outcome: "correct",
          count: 2
        }
      ]
    };

    await test.apply({
      runId: RECEIPT.runId,
      playerId: RECEIPT.playerId,
      receipt: RECEIPT,
      result
    });
    await test.apply({
      runId: RECEIPT.runId,
      playerId: RECEIPT.playerId,
      receipt: RECEIPT,
      result
    });

    expect(test.learningJournalStore.saveJournal).toHaveBeenCalledOnce();
    expect(test.learningJournalStore.saveJournal.mock.calls[0][1].events).toHaveLength(2);
  });

  it("rejects a receipt bound to a different account before any cloud write", async () => {
    const test = harness();
    await expect(
      test.apply({
        runId: RECEIPT.runId,
        playerId: "user_other",
        receipt: RECEIPT,
        result: {
          status: "won",
          score: 900,
          wardensDefeated: 2,
          echoesCollected: 3,
          moves: 12,
          elapsedMs: 30000
        }
      })
    ).rejects.toThrow("Offline replay account binding is invalid.");

    expect(test.playerStore.submitScore).not.toHaveBeenCalled();
    expect(test.questProgressStore.save).not.toHaveBeenCalled();
    expect(test.learningJournalStore.saveJournal).not.toHaveBeenCalled();
  });
});

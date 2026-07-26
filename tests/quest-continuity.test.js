import { describe, expect, it } from "vitest";
import {
  mergeSameQuestProgress,
  reconcileQuestProgress,
  selectDeferredQuestProgress
} from "../src/game/quest-continuity.js";
import {
  createQuestProgress,
  rememberMap,
  rememberQuestion
} from "../src/game/quest-progress.js";

/** @param {number} number @param {string} [questId] */
function progressAt(number, questId = "quest_shared_123") {
  return {
    ...createQuestProgress("trail-scout", number, questId),
    completedLabyrinths: number - 1
  };
}

describe("Quest Continuity", () => {
  it("migrates local progress into an empty cloud record", () => {
    const local = progressAt(4);

    expect(reconcileQuestProgress(local, null)).toEqual({
      kind: "upload-local",
      progress: local,
      expectedRevision: 0
    });
  });

  it("restores cloud progress when this browser has no local Quest", () => {
    const cloud = {
      progress: progressAt(8),
      revision: 3,
      updatedAt: "2026-07-26T00:00:00.000Z"
    };

    expect(reconcileQuestProgress(null, cloud)).toEqual({
      kind: "restore-cloud",
      progress: cloud.progress,
      revision: 3
    });
  });

  it("monotonically merges compatible device progress and uniqueness sets", () => {
    const local = rememberQuestion(
      rememberMap(progressAt(5), "map-local"),
      "question-local",
      6
    );
    const cloudProgress = rememberQuestion(
      rememberMap(progressAt(7), "map-cloud"),
      "question-cloud",
      9
    );

    const merged = mergeSameQuestProgress(local, cloudProgress);

    expect(merged).toMatchObject({
      questId: "quest_shared_123",
      labyrinthNumber: 7,
      completedLabyrinths: 6,
      nextQuestionOrdinal: 10,
      complete: false
    });
    expect(merged.usedMapFingerprints).toEqual(["map-cloud", "map-local"]);
    expect(merged.usedQuestionIds).toEqual([
      "question-cloud",
      "question-local"
    ]);
    expect(reconcileQuestProgress(local, {
      progress: cloudProgress,
      revision: 4,
      updatedAt: "2026-07-26T00:00:00.000Z"
    })).toEqual({
      kind: "merge-and-upload",
      progress: merged,
      expectedRevision: 4
    });
  });

  it("advances beyond divergent same-ordinal Question histories", () => {
    const local = rememberQuestion(progressAt(4), "question-local", 0);
    const cloud = rememberQuestion(progressAt(4), "question-cloud", 0);

    const merged = mergeSameQuestProgress(local, cloud);

    expect(merged.usedQuestionIds).toEqual([
      "question-cloud",
      "question-local"
    ]);
    expect(merged.nextQuestionOrdinal).toBe(2);
  });

  it("never silently merges different Quests at the same Quest Level", () => {
    const local = progressAt(4, "quest_local_123");
    const cloud = {
      progress: progressAt(9, "quest_cloud_456"),
      revision: 2,
      updatedAt: "2026-07-26T00:00:00.000Z"
    };

    expect(reconcileQuestProgress(local, cloud)).toEqual({
      kind: "conflict",
      local,
      cloud
    });
  });

  it("rejects corrupted records that reuse a Quest ID across Quest Levels", () => {
    expect(() =>
      mergeSameQuestProgress(
        progressAt(3),
        createQuestProgress("maze-master", 4, "quest_shared_123")
      )
    ).toThrow(/Quest Level/i);
  });

  it("keeps the finished local boundary when a deferred same-Quest merge fails", () => {
    const current = rememberMap(progressAt(5), "map-local-boundary");
    const incompatible = createQuestProgress(
      "maze-master",
      4,
      "quest_shared_123"
    );

    expect(selectDeferredQuestProgress(current, incompatible)).toBe(current);
    expect(selectDeferredQuestProgress(current, incompatible)).toMatchObject({
      labyrinthNumber: 5,
      usedMapFingerprints: ["map-local-boundary"]
    });
  });
});

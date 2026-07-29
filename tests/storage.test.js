import { describe, expect, it } from "vitest";
import {
  hasRunReplayOwnerMismatch,
  loadBestRun,
  loadRunRecords,
  saveBestRun,
  saveRunRecord,
  scrubRunReplays
} from "../src/game/storage.js";

function createStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => values.set(key, value)
  };
}

describe("best run storage", () => {
  it("keeps the faster completed passage", () => {
    const storage = createStorage();
    saveBestRun({ elapsedMs: 80000, moves: 90, seed: "SLOW" }, storage);
    saveBestRun({ elapsedMs: 70000, moves: 120, seed: "FAST" }, storage);
    saveBestRun({ elapsedMs: 90000, moves: 40, seed: "LATE" }, storage);

    expect(loadBestRun(storage)).toEqual({
      elapsedMs: 70000,
      moves: 120,
      seed: "FAST"
    });
  });

  it("ignores malformed stored data", () => {
    const storage = {
      getItem: () => "{broken",
      setItem: () => {}
    };
    expect(loadBestRun(storage)).toBeNull();
  });
});

describe("run record storage", () => {
  it("retains a bounded Replay atomically with its Run Record", () => {
    const storage = createStorage();
    const replay = {
      version: 1,
      actions: [
        { type: "move", direction: "right", elapsedMs: 120 },
        { type: "challenge-outcome", outcome: "correct", elapsedMs: 300 }
      ],
      terminal: {
        outcome: "escaped",
        moves: 2,
        elapsedMs: 300,
        echoesCollected: 3,
        echoTotal: 3,
        wardensDefeated: 1,
        score: 750,
        vitality: 3
      }
    };

    const records = saveRunRecord(
      {
        elapsedMs: 300,
        moves: 2,
        seed: "WITH-TRAIL",
        outcome: "escaped",
        echoesCollected: 3,
        questId: "quest_replay_123",
        replayOwnerId: "user_alice",
        replay
      },
      storage,
      "user_alice"
    );

    expect(records[0]?.replay).toEqual(replay);
    expect(records[0]?.replayOwnerId).toBe("user_alice");
    expect(records[0]?.questId).toBe("quest_replay_123");
    expect(loadRunRecords(storage)[0]).not.toHaveProperty("replay");
    expect(loadRunRecords(storage, "user_alice")[0]?.replay).toEqual(replay);
    expect(loadRunRecords(storage, "user_bob")[0]).not.toHaveProperty(
      "replay"
    );
    expect(hasRunReplayOwnerMismatch("user_alice", storage)).toBe(false);
    expect(hasRunReplayOwnerMismatch("user_bob", storage)).toBe(true);
  });

  it("omits an unsafe Replay without blocking terminal Record storage", () => {
    const storage = createStorage();
    const records = saveRunRecord(
      {
        elapsedMs: 500,
        moves: 4,
        seed: "SAFE-RECORD",
        outcome: "defeated",
        echoesCollected: 1,
        replay: {
          version: 1,
          actions: [{
            type: "answer-question",
            answerId: "selected-option",
            elapsedMs: 500
          }],
          terminal: {
            outcome: "defeated"
          }
        }
      },
      storage
    );

    expect(records).toHaveLength(1);
    expect(records[0]).not.toHaveProperty("replay");
    expect(JSON.stringify(records)).not.toContain("selected-option");
  });

  it("scrubs account-context Replay details without deleting old Records", () => {
    const storage = createStorage();
    saveRunRecord(
      {
        elapsedMs: 300,
        moves: 2,
        seed: "SCOPED-TRAIL",
        outcome: "escaped",
        echoesCollected: 3,
        replayOwnerId: "user_alice",
        replay: {
          version: 1,
          actions: [{ type: "move", direction: "right", elapsedMs: 300 }],
          terminal: {
            outcome: "escaped",
            moves: 2,
            elapsedMs: 300,
            echoesCollected: 3,
            echoTotal: 3,
            wardensDefeated: 0,
            score: 650,
            vitality: 3
          }
        }
      },
      storage
    );

    expect(JSON.parse(
      storage.getItem("echo-maze:best-run:v1") ?? "{}"
    )).toEqual({
      elapsedMs: 300,
      moves: 2,
      seed: "SCOPED-TRAIL"
    });
    expect(scrubRunReplays(storage)).toBe(true);
    expect(loadRunRecords(storage)).toEqual([
      expect.not.objectContaining({ replay: expect.anything() })
    ]);
    expect(loadRunRecords(storage)[0]?.seed).toBe("SCOPED-TRAIL");
    expect(storage.getItem("echo-maze:run-records:v1")).not.toContain(
      "user_alice"
    );
    expect(storage.getItem("echo-maze:best-run:v1")).not.toContain("replay");
  });

  it("keeps a previous owner's Replay hidden when scrub and save writes fail", () => {
    const values = new Map();
    let denyWrites = false;
    const storage = {
      /** @param {string} key */
      getItem: (key) => values.get(key) ?? null,
      /** @param {string} key @param {string} value */
      setItem: (key, value) => {
        if (denyWrites) {
          throw new Error("Storage unavailable");
        }
        values.set(key, value);
      }
    };
    const replay = {
      version: 1,
      actions: [{ type: "move", direction: "right", elapsedMs: 100 }],
      terminal: {
        outcome: "escaped",
        moves: 1,
        elapsedMs: 100,
        echoesCollected: 3,
        echoTotal: 3,
        wardensDefeated: 0,
        score: 650,
        vitality: 3
      }
    };
    saveRunRecord({
      elapsedMs: 100,
      moves: 1,
      seed: "ALICE-TRAIL",
      outcome: "escaped",
      echoesCollected: 3,
      replayOwnerId: "user_alice",
      replay
    }, storage, "user_alice");

    denyWrites = true;
    expect(scrubRunReplays(storage)).toBe(false);
    const visible = saveRunRecord({
      elapsedMs: 90,
      moves: 1,
      seed: "BOB-TRAIL",
      outcome: "escaped",
      echoesCollected: 3,
      replayOwnerId: "user_bob",
      replay
    }, storage, "user_bob");

    expect(visible.find((record) => record.seed === "ALICE-TRAIL"))
      .not.toHaveProperty("replay");
    expect(visible.find((record) => record.seed === "BOB-TRAIL")?.replay)
      .toEqual(replay);
    expect(JSON.stringify(visible)).not.toContain("user_alice");
  });

  it("ranks an escape ahead of a faster defeat", () => {
    const storage = createStorage();
    saveRunRecord(
      {
        elapsedMs: 12000,
        moves: 18,
        seed: "DEFEAT",
        outcome: "defeated",
        echoesCollected: 2
      },
      storage
    );
    const records = saveRunRecord(
      {
        elapsedMs: 70000,
        moves: 90,
        seed: "ESCAPE",
        outcome: "escaped",
        echoesCollected: 3
      },
      storage
    );

    expect(records.map((record) => record.seed)).toEqual(["ESCAPE", "DEFEAT"]);
  });

  it("preserves the Quest Level, Labyrinth Number, and total Echoes", () => {
    const storage = createStorage();
    const records = saveRunRecord(
      {
        elapsedMs: 45000,
        moves: 55,
        seed: "BRIGHT-RECORD",
        outcome: "escaped",
        echoesCollected: 2,
        echoTotal: 2,
        questLevelId: "bright-start",
        labyrinthNumber: 13
      },
      storage
    );

    expect(records[0]).toMatchObject({
      echoesCollected: 2,
      echoTotal: 2,
      questLevelId: "bright-start",
      labyrinthNumber: 13
    });
  });

  it("preserves exact Region rules and separates unlike rulesets", () => {
    const storage = createStorage();
    saveRunRecord(
      {
        elapsedMs: 45000,
        moves: 55,
        seed: "RULESET-RECORD",
        outcome: "escaped",
        echoesCollected: 3,
        questLevelId: "trail-scout",
        labyrinthNumber: 1,
        atlasRegionId: "foundation",
        rulesetRevision: "classic-v1"
      },
      storage
    );
    const records = saveRunRecord(
      {
        elapsedMs: 47000,
        moves: 57,
        seed: "RULESET-RECORD",
        outcome: "escaped",
        echoesCollected: 3,
        questLevelId: "trail-scout",
        labyrinthNumber: 1,
        atlasRegionId: "foundation",
        rulesetRevision: "echo-hush-v1"
      },
      storage
    );

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.rulesetRevision)).toEqual([
      "classic-v1",
      "echo-hush-v1"
    ]);
  });

  it("rejects a Record with an impossible Region and ruleset pair", () => {
    expect(
      saveRunRecord(
        {
          elapsedMs: 45000,
          moves: 55,
          seed: "BROKEN-RULESET",
          outcome: "escaped",
          echoesCollected: 3,
          questLevelId: "trail-scout",
          labyrinthNumber: 1,
          atlasRegionId: "foundation",
          rulesetRevision: "windways-v1"
        },
        createStorage()
      )
    ).toEqual([]);
  });

  it("ranks defeated attempts by Echo progress", () => {
    const storage = createStorage();
    saveRunRecord(
      {
        elapsedMs: 30000,
        moves: 30,
        seed: "ONE-ECHO",
        outcome: "defeated",
        echoesCollected: 1
      },
      storage
    );
    const records = saveRunRecord(
      {
        elapsedMs: 50000,
        moves: 50,
        seed: "TWO-ECHO",
        outcome: "defeated",
        echoesCollected: 2
      },
      storage
    );

    expect(records.map((record) => record.seed)).toEqual([
      "TWO-ECHO",
      "ONE-ECHO"
    ]);
  });

  it("replaces a defeated seed with its later escape", () => {
    const storage = createStorage();
    saveRunRecord(
      {
        elapsedMs: 30000,
        moves: 30,
        seed: "COMEBACK",
        outcome: "defeated",
        echoesCollected: 2
      },
      storage
    );
    saveRunRecord(
      {
        elapsedMs: 90000,
        moves: 90,
        seed: "COMEBACK",
        outcome: "escaped",
        echoesCollected: 3
      },
      storage
    );

    expect(loadRunRecords(storage)).toEqual([
      {
        elapsedMs: 90000,
        moves: 90,
        seed: "COMEBACK",
        outcome: "escaped",
        echoesCollected: 3
      }
    ]);
  });

  it("ranks completed runs by time, then moves", () => {
    const storage = createStorage();
    saveRunRecord({ elapsedMs: 70000, moves: 90, seed: "SECOND" }, storage);
    saveRunRecord({ elapsedMs: 60000, moves: 100, seed: "FIRST-TIE" }, storage);
    const records = saveRunRecord(
      { elapsedMs: 60000, moves: 80, seed: "FIRST" },
      storage
    );

    expect(records.map((record) => record.seed)).toEqual([
      "FIRST",
      "FIRST-TIE",
      "SECOND"
    ]);
  });

  it("keeps only the better result for the same seed", () => {
    const storage = createStorage();
    saveRunRecord({ elapsedMs: 80000, moves: 90, seed: "REPLAY" }, storage);
    saveRunRecord({ elapsedMs: 90000, moves: 70, seed: "REPLAY" }, storage);
    saveRunRecord({ elapsedMs: 80000, moves: 75, seed: "REPLAY" }, storage);

    expect(loadRunRecords(storage)).toEqual([
      {
        elapsedMs: 80000,
        moves: 75,
        seed: "REPLAY",
        outcome: "escaped",
        echoesCollected: 3
      }
    ]);
  });

  it("keeps the same seed as separate records on different Quest Levels", () => {
    const storage = createStorage();
    saveRunRecord(
      {
        elapsedMs: 80000,
        moves: 90,
        seed: "SHARED-SEED",
        questLevelId: "bright-start",
        echoTotal: 2
      },
      storage
    );
    const records = saveRunRecord(
      {
        elapsedMs: 90000,
        moves: 95,
        seed: "SHARED-SEED",
        questLevelId: "maze-master",
        echoTotal: 4
      },
      storage
    );

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.questLevelId)).toEqual([
      "bright-start",
      "maze-master"
    ]);
  });

  it("keeps the same seed as separate records on different Labyrinths", () => {
    const storage = createStorage();
    saveRunRecord(
      {
        elapsedMs: 80000,
        moves: 90,
        seed: "SHARED-LABYRINTH-SEED",
        questLevelId: "trail-scout",
        labyrinthNumber: 5,
        echoTotal: 4
      },
      storage
    );
    const records = saveRunRecord(
      {
        elapsedMs: 90000,
        moves: 95,
        seed: "SHARED-LABYRINTH-SEED",
        questLevelId: "trail-scout",
        labyrinthNumber: 13,
        echoTotal: 5
      },
      storage
    );

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.labyrinthNumber)).toEqual([5, 13]);
  });

  it("keeps the five best runs", () => {
    const storage = createStorage();
    for (let index = 0; index < 6; index += 1) {
      saveRunRecord(
        {
          elapsedMs: 60000 + index * 1000,
          moves: 60 + index,
          seed: `RUN-${index}`
        },
        storage
      );
    }

    expect(loadRunRecords(storage).map((record) => record.seed)).toEqual([
      "RUN-0",
      "RUN-1",
      "RUN-2",
      "RUN-3",
      "RUN-4"
    ]);
  });

  it("migrates the existing best run into records", () => {
    const storage = createStorage();
    saveBestRun({ elapsedMs: 70000, moves: 70, seed: "LEGACY" }, storage);

    expect(loadRunRecords(storage)).toEqual([
      {
        elapsedMs: 70000,
        moves: 70,
        seed: "LEGACY",
        outcome: "escaped",
        echoesCollected: 3
      }
    ]);
  });

  it("normalizes escaped records to all three Echoes", () => {
    const storage = createStorage();
    storage.setItem(
      "echo-maze:run-records:v1",
      JSON.stringify([
        {
          elapsedMs: 50000,
          moves: 60,
          seed: "IMPOSSIBLE-ESCAPE",
          outcome: "escaped",
          echoesCollected: 0
        }
      ])
    );

    expect(loadRunRecords(storage)).toEqual([
      {
        elapsedMs: 50000,
        moves: 60,
        seed: "IMPOSSIBLE-ESCAPE",
        outcome: "escaped",
        echoesCollected: 3
      }
    ]);
  });

  it("ignores malformed record data", () => {
    const storage = {
      getItem: () => "{broken",
      setItem: () => {}
    };

    expect(loadRunRecords(storage)).toEqual([]);
  });

  it("returns the ranked records when browser storage rejects a write", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage unavailable");
      }
    };
    const candidate = { elapsedMs: 65000, moves: 70, seed: "OFFLINE" };

    expect(saveRunRecord(candidate, storage)).toEqual([
      {
        ...candidate,
        outcome: "escaped",
        echoesCollected: 3
      }
    ]);
  });
});

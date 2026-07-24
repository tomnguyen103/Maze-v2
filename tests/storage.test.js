import { describe, expect, it } from "vitest";
import {
  loadBestRun,
  loadRunRecords,
  saveBestRun,
  saveRunRecord
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

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
      { elapsedMs: 80000, moves: 75, seed: "REPLAY" }
    ]);
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
      { elapsedMs: 70000, moves: 70, seed: "LEGACY" }
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

    expect(saveRunRecord(candidate, storage)).toEqual([candidate]);
  });
});

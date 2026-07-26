import { describe, expect, it } from "vitest";
import {
  createDailyContract,
  getDailyQuestion,
  isDailyCurrent,
  loadDailyRecord,
  resolveDailyRequest,
  saveDailyResult,
  utcDateKey
} from "../src/game/daily-labyrinth.js";

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

describe("Daily Shared Labyrinth", () => {
  it("derives one stable casual contract from a UTC date", () => {
    expect(createDailyContract("2026-07-26")).toEqual({
      version: 1,
      date: "2026-07-26",
      seed: "DAILY-20260726",
      levelId: "trail-scout",
      labyrinthNumber: 5,
      questionStartOrdinal: 1322240
    });
    expect(utcDateKey(new Date("2026-07-26T23:59:59.999-05:00"))).toBe(
      "2026-07-27"
    );
  });

  it("serves the same reviewed bundled Question sequence without a provider", () => {
    const daily = createDailyContract("2026-07-26");

    expect([0, 1, 2].map((index) => getDailyQuestion(daily, index).id)).toEqual([
      "scout-developing-1322240",
      "scout-developing-1322241",
      "scout-developing-1322242"
    ]);
    expect(
      createDailyContract("2026-07-27").questionStartOrdinal -
        daily.questionStartOrdinal
    ).toBe(64);
  });

  it("accepts only today's UTC link and explains every other date as expired", () => {
    const now = new Date("2026-07-26T23:59:59.999Z");

    expect(resolveDailyRequest(null, now)).toEqual({
      status: "none",
      requestedDate: null,
      currentDate: "2026-07-26"
    });
    expect(resolveDailyRequest("2026-07-26", now)).toEqual({
      status: "current",
      requestedDate: "2026-07-26",
      currentDate: "2026-07-26"
    });
    expect(resolveDailyRequest("2026-07-25", now)).toEqual({
      status: "expired",
      requestedDate: "2026-07-25",
      currentDate: "2026-07-26"
    });
    expect(resolveDailyRequest("not-a-date", now)).toEqual({
      status: "expired",
      requestedDate: null,
      currentDate: "2026-07-26"
    });
    expect(
      isDailyCurrent(
        createDailyContract("2026-07-26"),
        new Date("2026-07-26T23:59:59.999Z")
      )
    ).toBe(true);
    expect(
      isDailyCurrent(
        createDailyContract("2026-07-26"),
        new Date("2026-07-27T00:00:00.000Z")
      )
    ).toBe(false);
  });

  it("keeps one local Personal Best per date and never stores identity data", () => {
    const storage = createStorage();
    const daily = createDailyContract("2026-07-26");

    saveDailyResult(
      daily,
      { outcome: "defeated", elapsedMs: 9000, moves: 14 },
      storage
    );
    expect(loadDailyRecord(daily.date, storage)).toEqual({
      version: 1,
      date: "2026-07-26",
      seed: "DAILY-20260726",
      completed: false,
      bestElapsedMs: null,
      bestMoves: null
    });

    saveDailyResult(
      daily,
      { outcome: "escaped", elapsedMs: 8000, moves: 12 },
      storage
    );
    saveDailyResult(
      daily,
      { outcome: "escaped", elapsedMs: 9000, moves: 10 },
      storage
    );
    expect(loadDailyRecord(daily.date, storage)).toEqual({
      version: 1,
      date: "2026-07-26",
      seed: "DAILY-20260726",
      completed: true,
      bestElapsedMs: 8000,
      bestMoves: 12
    });
    expect(storage.getItem("echo-maze:daily-records:v1")).not.toMatch(
      /name|email|username|score|quest/i
    );
  });

  it("recovers safely from malformed Daily storage", () => {
    const storage = createStorage();
    storage.setItem("echo-maze:daily-records:v1", "{broken");

    expect(loadDailyRecord("2026-07-26", storage)).toBeNull();
  });
});

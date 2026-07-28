import { describe, expect, it } from "vitest";
import { createQuestionBankStore } from "../server/question-bank-store.js";

/**
 * @param {Record<string, unknown>[]} rows
 */
function createPool(rows) {
  /** @type {{ sql: string, values: unknown[] }[]} */
  const queries = [];
  return {
    queries,
    /** @param {string} sql @param {unknown[]} [values] */
    async query(sql, values = []) {
      queries.push({ sql, values });
      return { rows };
    }
  };
}

const card = (/** @type {string} */ id) => ({
  id,
  prompt: "What is 2 + 2?",
  choices: [
    { id: "a", label: "3" },
    { id: "b", label: "4" },
    { id: "c", label: "5" }
  ],
  answerId: "b",
  hint: "Count on.",
  explanation: "Two and two make four.",
  difficultyBand: "foundation",
  difficultyRank: 11,
  topicId: "arithmetic",
  learningObjectiveId: "bright-combine-groups"
});

describe("question bank store", () => {
  it("asks only for published versions of the requested level and band", async () => {
    const pool = createPool([{ content: card("db-1") }]);
    const store = createQuestionBankStore(pool);
    await store.publishedQuestion({
      levelId: "bright-start",
      difficultyBand: "foundation",
      questionOrdinal: 0
    });
    const [{ sql, values }] = pool.queries;
    expect(sql).toContain("status = 'published'");
    expect(sql).toContain("question_versions");
    expect(values).toEqual(["bright-start", "foundation", 200]);
  });

  it("cycles through the deck by ordinal, like the bundled bank", async () => {
    const pool = createPool([
      { content: card("db-1") },
      { content: card("db-2") },
      { content: card("db-3") }
    ]);
    const store = createQuestionBankStore(pool);
    /** @param {number} ordinal */
    const at = (ordinal) =>
      store.publishedQuestion({
        levelId: "bright-start",
        difficultyBand: "foundation",
        questionOrdinal: ordinal
      });
    expect((await at(0))?.id).toBe("db-1");
    expect((await at(2))?.id).toBe("db-3");
    expect((await at(4))?.id).toBe("db-2");
  });

  it("returns null when the band has no published card", async () => {
    const store = createQuestionBankStore(createPool([]));
    const result = await store.publishedQuestion({
      levelId: "maze-master",
      difficultyBand: "mastery",
      questionOrdinal: 1
    });
    expect(result).toBeNull();
  });

  it("rejects a malformed row rather than serving it", async () => {
    // A row that fails the same validation the bundled bank passes is not
    // something a player may see. It throws rather than reading as "nothing
    // published", so the service reports it and still falls back.
    const store = createQuestionBankStore(
      createPool([{ content: { id: "broken", prompt: "" } }])
    );
    await expect(
      store.publishedQuestion({
        levelId: "bright-start",
        difficultyBand: "foundation",
        questionOrdinal: 0
      })
    ).rejects.toThrow();
  });

  it("rejects a row whose content contradicts the band it is filed under", async () => {
    // Content and band live in different tables, so no CHECK can hold them
    // together; a miscategorized publish would serve a foundation prompt at
    // mastery.
    const store = createQuestionBankStore(createPool([{ content: card("db-1") }]));
    await expect(
      store.publishedQuestion({
        levelId: "bright-start",
        difficultyBand: "mastery",
        questionOrdinal: 0
      })
    ).rejects.toThrow(/difficulty band/i);
  });
});

describe("question API composition", () => {
  it("runs on the bundled bank alone when no database is configured", async () => {
    const { createQuestionApi } = await import("../server/question-api.js");
    // Constructing without DATABASE_URL must not reach for a pool.
    expect(typeof createQuestionApi({ QUESTION_PROVIDER: "bundled" })).toBe(
      "function"
    );
  });
});

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

const publishedRow = (/** @type {string} */ id, version = 1) => ({
  id,
  version,
  content: card(id)
});

describe("question bank store", () => {
  it("asks only for published versions of the requested level and band", async () => {
    const pool = createPool([publishedRow("db-1")]);
    const store = createQuestionBankStore(pool);
    await store.publishedQuestion({
      levelId: "bright-start",
      difficultyBand: "foundation",
      questionOrdinal: 0
    });
    const [{ sql, values }] = pool.queries;
    expect(sql).toContain("status = 'published'");
    expect(sql).toContain("question_versions");
    expect(sql).toContain("q.question_ordinal = $3");
    expect(values).toEqual(["bright-start", "foundation", 0]);
  });

  it("uses only the published overlay for the requested ordinal", async () => {
    const pool = createPool([publishedRow("db-7")]);
    const store = createQuestionBankStore(pool);
    expect(
      (
        await store.publishedQuestion({
          levelId: "bright-start",
          difficultyBand: "foundation",
          questionOrdinal: 7
        })
      )?.id
    ).toBe("db-7");
    expect(pool.queries[0].values[2]).toBe(7);
  });

  it("binds published content to the immutable database version", async () => {
    const pool = createPool([
      { id: "db-7", version: 3, content: card("db-7") }
    ]);
    const store = createQuestionBankStore(pool);

    const question = await store.publishedQuestion({
      levelId: "bright-start",
      difficultyBand: "foundation",
      questionOrdinal: 7
    });

    expect(pool.queries[0].sql).toContain("q.id");
    expect(pool.queries[0].sql).toContain("v.version");
    expect(question?.reviewedRevisionId).toBe("database:db-7:v3");
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
      createPool([
        { id: "broken", version: 1, content: { id: "broken", prompt: "" } }
      ])
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
    const store = createQuestionBankStore(
      createPool([publishedRow("db-1")])
    );
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

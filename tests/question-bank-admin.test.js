import { describe, expect, it } from "vitest";
import { createQuestionBankStore } from "../server/question-bank-store.js";

const card = {
  id: "math-1",
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
};

/** @param {Record<string, unknown>[][]} responses */
function transactionPool(responses) {
  /** @type {{ sql: string, values: unknown[] }[]} */
  const queries = [];
  let responseIndex = 0;
  const client = {
    /** @param {string} sql @param {unknown[]} [values] */
    async query(sql, values = []) {
      queries.push({ sql, values });
      const rows = responses[responseIndex] ?? [];
      responseIndex += 1;
      return { rows };
    },
    release() {}
  };
  return {
    queries,
    /** @param {string} sql @param {unknown[]} [values] */
    async query(sql, values = []) {
      queries.push({ sql, values });
      const rows = responses[responseIndex] ?? [];
      responseIndex += 1;
      return { rows };
    },
    async connect() {
      return client;
    }
  };
}

describe("question bank admin writes", () => {
  it("validates and inserts the next immutable draft version", async () => {
    const pool = transactionPool([
      [],
      [],
      [
        {
          level_id: "bright-start",
          difficulty_band: "foundation",
          question_ordinal: 0
        }
      ],
      [{ version: 2 }],
      [{ id: "math-1", version: 2 }],
      []
    ]);
    const store = createQuestionBankStore(pool);
    await expect(
      store.saveDraft({
        id: "math-1",
        levelId: "bright-start",
        difficultyBand: "foundation",
        questionOrdinal: 0,
        content: card
      }, "admin_1")
    ).resolves.toEqual({ id: "math-1", version: 2 });
    expect(pool.queries.map(({ sql }) => sql.trim().split(/\s+/)[0])).toEqual([
      "BEGIN",
      "INSERT",
      "SELECT",
      "SELECT",
      "INSERT",
      "COMMIT"
    ]);
    expect(pool.queries[4].values[2]).toEqual(card);
    expect(pool.queries[4].values[3]).toBe("admin_1");
  });

  it("rejects content filed under a different difficulty band", async () => {
    const pool = transactionPool([]);
    const store = createQuestionBankStore(pool);
    await expect(
      store.saveDraft({
        id: "math-1",
        levelId: "bright-start",
        difficultyBand: "mastery",
        questionOrdinal: 0,
        content: card
      }, "admin_1")
    ).rejects.toThrow(/difficulty band/i);
    expect(pool.queries).toEqual([]);
  });

  it("does not let a draft move an existing published question", async () => {
    const pool = transactionPool([
      [],
      [],
      [
        {
          level_id: "bright-start",
          difficulty_band: "foundation",
          question_ordinal: 0
        }
      ],
      []
    ]);
    const store = createQuestionBankStore(pool);
    await expect(
      store.saveDraft(
        {
          id: "math-1",
          levelId: "bright-start",
          difficultyBand: "foundation",
          questionOrdinal: 1,
          content: card
        },
        "moderator_1"
      )
    ).rejects.toThrow(/live placement/i);
    expect(pool.queries.at(-1)?.sql).toBe("ROLLBACK");
    expect(
      pool.queries.some(({ sql }) => sql.includes("question_versions ("))
    ).toBe(false);
  });

  it("publishes one locked version inside a transaction", async () => {
    const pool = transactionPool([
      [],
      [{ content: card }],
      [],
      [{ id: "math-1", version: 2 }],
      []
    ]);
    const store = createQuestionBankStore(pool);
    await expect(store.publishVersion("math-1", 2)).resolves.toEqual({
      id: "math-1",
      version: 2
    });
    expect(pool.queries[1].sql).toContain("FOR UPDATE");
    expect(pool.queries[2].sql).toContain("status = 'draft'");
    expect(pool.queries[3].sql).toContain("status = 'published'");
  });

  it("deletes a question only when it exists", async () => {
    const pool = transactionPool([[{ id: "math-1" }]]);
    const store = createQuestionBankStore(pool);
    await expect(store.deleteQuestion("math-1")).resolves.toEqual({
      id: "math-1",
      deleted: true
    });
  });
});

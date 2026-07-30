import { describe, expect, it, vi } from "vitest";
import { createQuestProgressStore } from "../server/quest-progress-store.js";
import { createQuestProgress } from "../src/game/quest-progress.js";
import { getPublishedLearningDeckOptions } from "../src/questions/learning-deck-catalog.js";

const DECKS = Object.fromEntries(
  getPublishedLearningDeckOptions().map((deck) => [deck.deckId, deck])
);

const ROW = {
  schema_version: 1,
  quest_id: "quest_cloud_123",
  level_id: "trail-scout",
  learning_deck_id: null,
  learning_deck_revision: null,
  labyrinth_number: 4,
  completed_labyrinths: 3,
  used_map_fingerprints: ["map-a"],
  used_question_ids: ["question-a"],
  next_question_ordinal: 1,
  complete: false,
  revision: 3,
  updated_at: "2026-07-26T00:00:00.000Z"
};

/**
 * @param {(
 *   sql: string,
 *   values?: unknown[]
 * ) => Promise<{ rows: Record<string, unknown>[] }>} query
 */
function tenantPool(query) {
  const clientQuery = vi.fn(async (sql, values) => {
    if (
      sql === "BEGIN" ||
      sql === "COMMIT" ||
      sql === "ROLLBACK" ||
      sql.includes("set_config")
    ) {
      return { rows: [] };
    }
    return query(sql, values);
  });
  return {
    query,
    clientQuery,
    connect: vi.fn(async () => ({
      query: clientQuery,
      release: vi.fn()
    }))
  };
}

describe("Cloud Quest store", () => {
  it("maps the authenticated Explorer's boundary record", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [ROW] });
    const pool = tenantPool(query);

    await expect(
      createQuestProgressStore(pool).get("user_123")
    ).resolves.toEqual({
      progress: {
        version: 2,
        questId: "quest_cloud_123",
        levelId: "trail-scout",
        learningDeckId: "mixed-trail",
        learningDeckRevision: DECKS["mixed-trail"].revisionId,
        labyrinthNumber: 4,
        completedLabyrinths: 3,
        usedMapFingerprints: ["map-a"],
        usedQuestionIds: ["question-a"],
        nextQuestionOrdinal: 1,
        complete: false
      },
      revision: 3,
      updatedAt: "2026-07-26T00:00:00.000Z"
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /FROM cloud_quest_progress[\s\S]+classroom_id IS NOT DISTINCT FROM \$2/
      ),
      ["user_123", null]
    );
    expect(pool.clientQuery.mock.calls[1]).toEqual([
      expect.stringContaining("set_config"),
      ["user_123", ""]
    ]);
  });

  it("never rewrites the Learning Deck of the same stored Quest", async () => {
    const wordTrail = DECKS["mixed-trail"];
    const stored = {
      ...ROW,
      schema_version: 2,
      learning_deck_id: wordTrail.deckId,
      learning_deck_revision: wordTrail.revisionId
    };
    const query = vi.fn(async (sql) => {
      // The guarded UPDATE matches no row when the Deck identity differs.
      if (sql.includes("UPDATE cloud_quest_progress")) {
        return { rows: [] };
      }
      if (sql.includes("deleted_user_tombstones")) {
        return { rows: [] };
      }
      return { rows: [stored] };
    });
    const swapped = {
      ...createQuestProgress("trail-scout", 4, "quest_cloud_123", {
        deckId: DECKS["number-trail"].deckId,
        revisionId: DECKS["number-trail"].revisionId
      }),
      usedMapFingerprints: ["map-a"],
      usedQuestionIds: ["question-a"],
      nextQuestionOrdinal: 1
    };

    const result = await createQuestProgressStore(tenantPool(query)).save(
      "user_123",
      3,
      swapped
    );

    expect(result.conflict).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.record?.progress.learningDeckId).toBe(wordTrail.deckId);
    const update = query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes("UPDATE cloud_quest_progress"));
    // Deck identity is immutable until the Quest ends or is replaced, so the
    // write may only land when the Quest ID changes or the Deck still matches.
    expect(update).toMatch(/quest_id <> \$4/);
    expect(update).toMatch(/learning_deck_id = \$6/);
    expect(update).toMatch(/learning_deck_revision = \$7/);
  });

  it("maps one exact version-2 Deck identity from the cloud boundary", async () => {
    const numberTrail = DECKS["number-trail"];
    const query = vi.fn().mockResolvedValue({
      rows: [{
        ...ROW,
        schema_version: 2,
        learning_deck_id: numberTrail.deckId,
        learning_deck_revision: numberTrail.revisionId
      }]
    });

    await expect(
      createQuestProgressStore(tenantPool(query)).get("user_123")
    ).resolves.toMatchObject({
      progress: {
        version: 2,
        learningDeckId: numberTrail.deckId,
        learningDeckRevision: numberTrail.revisionId
      }
    });
  });

  it("selects one independent synchronized Classroom record", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ role: "student" }] })
      .mockResolvedValueOnce({ rows: [ROW] });
    const pool = tenantPool(query);

    await expect(
      createQuestProgressStore(pool).get(
        "user_123",
        "org_morning_123"
      )
    ).resolves.toMatchObject({ revision: 3 });

    expect(pool.clientQuery.mock.calls[1]).toEqual([
      expect.stringContaining("set_config"),
      ["user_123", "org_morning_123"]
    ]);
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining("FROM classroom_memberships"),
      ["org_morning_123", "user_123"]
    ]);
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining("classroom_id IS NOT DISTINCT FROM $2"),
      ["user_123", "org_morning_123"]
    ]);
  });

  it("inserts revision one for an empty cloud record", async () => {
    const progress = createQuestProgress(
      "trail-scout",
      1,
      "quest_cloud_123"
    );
    const query = vi.fn().mockResolvedValue({
      rows: [{ ...ROW, labyrinth_number: 1, completed_labyrinths: 0, revision: 1 }]
    });
    const pool = tenantPool(query);

    const result = await createQuestProgressStore(pool).save(
      "user_123",
      0,
      progress
    );

    expect(result).toMatchObject({ conflict: false, duplicate: false });
    expect(query.mock.calls[0][0]).toContain(
      "INSERT INTO player_access"
    );
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT DO NOTHING");
    expect(query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[0][0]).toContain(
      "deleted_user_tombstones"
    );
    expect(query.mock.calls[0][0]).toContain("learning_deck_id");
    expect(query.mock.calls[0][0]).toContain("learning_deck_revision");
    expect(query.mock.calls[0][1]).toContain("mixed-trail");
    expect(query.mock.calls[0][1]).toContain(
      DECKS["mixed-trail"].revisionId
    );
    expect(query.mock.calls[0][1][0]).toBe("user_123");
    expect(query.mock.calls[0][1].at(-1)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("writes the selected published Deck on optimistic updates", async () => {
    const numberTrail = DECKS["number-trail"];
    const progress = createQuestProgress(
      "trail-scout",
      4,
      "quest_cloud_123",
      numberTrail
    );
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          ...ROW,
          schema_version: 2,
          learning_deck_id: numberTrail.deckId,
          learning_deck_revision: numberTrail.revisionId
        }]
      });

    await createQuestProgressStore(tenantPool(query)).save(
      "user_123",
      2,
      progress
    );

    expect(query.mock.calls[0][0]).toContain("learning_deck_id = $6");
    expect(query.mock.calls[0][0]).toContain(
      "learning_deck_revision = $7"
    );
    expect(query.mock.calls[0][1][5]).toBe(numberTrail.deckId);
    expect(query.mock.calls[0][1][6]).toBe(numberTrail.revisionId);
  });

  it("reports a deleted account instead of an initial-save conflict", async () => {
    const progress = createQuestProgress(
      "trail-scout",
      1,
      "quest_cloud_123"
    );
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    const pool = tenantPool(query);

    await expect(
      createQuestProgressStore(pool).save("user_123", 0, progress)
    ).rejects.toMatchObject({ name: "DeletedUserError" });
    expect(query.mock.calls[1][0]).toContain(
      "FROM deleted_user_tombstones"
    );
  });

  it("reports a deleted account instead of an update conflict", async () => {
    const progress = createQuestProgress(
      "trail-scout",
      4,
      "quest_cloud_123"
    );
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    const pool = tenantPool(query);

    await expect(
      createQuestProgressStore(pool).save("user_123", 2, progress)
    ).rejects.toMatchObject({ name: "DeletedUserError" });
  });

  it("updates only the expected revision and surfaces a stale conflict", async () => {
    const progress = createQuestProgress(
      "trail-scout",
      4,
      "quest_cloud_123"
    );
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ROW] });
    const pool = tenantPool(query);

    const result = await createQuestProgressStore(pool).save(
      "user_123",
      2,
      progress
    );

    expect(query.mock.calls[0][0]).toContain("revision = $2");
    expect(result).toMatchObject({
      conflict: true,
      duplicate: false,
      record: { revision: 3 }
    });
  });

  it("treats an identical retry as idempotent despite a stale revision", async () => {
    const progress = {
      ...createQuestProgress("trail-scout", 4, "quest_cloud_123"),
      completedLabyrinths: 3,
      usedMapFingerprints: ["map-a"],
      usedQuestionIds: ["question-a"],
      nextQuestionOrdinal: 1
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ROW] });
    const pool = tenantPool(query);

    await expect(
      createQuestProgressStore(pool).save("user_123", 2, progress)
    ).resolves.toMatchObject({ conflict: false, duplicate: true });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createQuestProgressStore } from "../server/quest-progress-store.js";
import { createQuestProgress } from "../src/game/quest-progress.js";

const ROW = {
  schema_version: 1,
  quest_id: "quest_cloud_123",
  level_id: "trail-scout",
  labyrinth_number: 4,
  completed_labyrinths: 3,
  used_map_fingerprints: ["map-a"],
  used_question_ids: ["question-a"],
  next_question_ordinal: 1,
  complete: false,
  revision: 3,
  updated_at: "2026-07-26T00:00:00.000Z"
};

describe("Cloud Quest store", () => {
  it("maps the authenticated Explorer's boundary record", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [ROW] })
    };

    await expect(
      createQuestProgressStore(pool).get("user_123")
    ).resolves.toEqual({
      progress: {
        version: 1,
        questId: "quest_cloud_123",
        levelId: "trail-scout",
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
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ["user_123"]);
  });

  it("inserts revision one for an empty cloud record", async () => {
    const progress = createQuestProgress(
      "trail-scout",
      1,
      "quest_cloud_123"
    );
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ ...ROW, labyrinth_number: 1, completed_labyrinths: 0, revision: 1 }]
      })
    };

    const result = await createQuestProgressStore(pool).save(
      "user_123",
      0,
      progress
    );

    expect(result).toMatchObject({ conflict: false, duplicate: false });
    expect(pool.query.mock.calls[0][0]).toContain(
      "INSERT INTO player_access"
    );
    expect(pool.query.mock.calls[0][0]).toContain("ON CONFLICT DO NOTHING");
    expect(pool.query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(pool.query.mock.calls[0][0]).toContain(
      "deleted_user_tombstones"
    );
    expect(pool.query.mock.calls[0][1][0]).toBe("user_123");
    expect(pool.query.mock.calls[0][1].at(-1)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("updates only the expected revision and surfaces a stale conflict", async () => {
    const progress = createQuestProgress(
      "trail-scout",
      4,
      "quest_cloud_123"
    );
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [ROW] })
    };

    const result = await createQuestProgressStore(pool).save(
      "user_123",
      2,
      progress
    );

    expect(pool.query.mock.calls[0][0]).toContain("revision = $2");
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
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [ROW] })
    };

    await expect(
      createQuestProgressStore(pool).save("user_123", 2, progress)
    ).resolves.toMatchObject({ conflict: false, duplicate: true });
  });
});

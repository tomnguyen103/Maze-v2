import { describe, expect, it, vi } from "vitest";
import { createLearningJournalStore } from "../server/learning-journal-store.js";

const JOURNAL = {
  version: 1,
  events: [
    {
      eventId: "event_00000000-0000-4000-8000-000000000201",
      questionId: "scout-capable-0",
      topicId: "arithmetic",
      learningObjectiveId: "scout-equal-groups",
      difficultyBand: "capable",
      outcome: "correct"
    }
  ]
};

describe("learning Journal store", () => {
  it("returns an empty Journal when an account has no cloud copy", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createLearningJournalStore({ query });

    await expect(store.getJournal("user_123")).resolves.toEqual({
      version: 1,
      events: []
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM learning_journals"),
      ["user_123"]
    );
  });

  it("ensures account access and upserts one bounded JSON Journal", async () => {
    const query = vi.fn(async () => ({ rows: [{ journal: JOURNAL }] }));
    const store = createLearningJournalStore({ query });

    await expect(store.saveJournal("user_123", JOURNAL)).resolves.toEqual(
      JOURNAL
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /INSERT INTO player_access[\s\S]+INSERT INTO learning_journals[\s\S]+ON CONFLICT[\s\S]+DISTINCT ON[\s\S]+jsonb_array_elements[\s\S]+LIMIT 200/
      ),
      ["user_123", JSON.stringify(JOURNAL)]
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /\(learning_journals\.journal->'events'\)\s*\|\|\s*\(EXCLUDED\.journal->'events'\)/
      ),
      ["user_123", JSON.stringify(JOURNAL)]
    );
  });

  it("deletes only the selected account Journal", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createLearningJournalStore({ query });

    await store.clearJournal("user_123");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM learning_journals"),
      ["user_123"]
    );
  });
});

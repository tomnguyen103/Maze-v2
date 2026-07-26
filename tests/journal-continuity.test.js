import { describe, expect, it, vi } from "vitest";
import { createJournalContinuity } from "../src/learning/journal-continuity.js";
import { createLanternJournal } from "../src/learning/lantern-journal.js";
import { getBundledQuestion } from "../src/questions/question-bank.js";

function question(ordinal = 0) {
  return getBundledQuestion({
    levelId: "trail-scout",
    seed: "continuity-test",
    wardenId: 0,
    labyrinthNumber: 9,
    questionOrdinal: ordinal
  });
}

/** @param {number} value */
function eventId(value) {
  return `event_00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function createStorage() {
  const records = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => records.get(key) ?? null,
    /** @param {string} key */
    removeItem: (key) => records.delete(key),
    /** @param {string} key @param {string} value */
    setItem: (key, value) => records.set(key, value)
  };
}

describe("Lantern Journal continuity", () => {
  it("keeps gameplay-facing recording operable when device storage is denied", async () => {
    const onStatus = vi.fn();
    const continuity = createJournalContinuity({
      client: {
        getLearningJournal: vi.fn(),
        saveLearningJournal: vi.fn(),
        clearLearningJournal: vi.fn()
      },
      storage: {
        getItem: () => null,
        removeItem: () => {},
        setItem: () => {
          throw new Error("storage denied");
        }
      },
      onStatus
    });

    await continuity.selectUser("");
    expect(() =>
      continuity.record(question(), "wrong", () => eventId(9))
    ).not.toThrow();
    expect(continuity.getJournal().events).toHaveLength(1);
    expect(onStatus).toHaveBeenLastCalledWith(
      "Journal storage is unavailable on this device."
    );
  });

  it("clears authenticated cloud history when device storage is denied", async () => {
    let cloudJournal = {
      version: 1,
      events: [
        {
          eventId: eventId(10),
          questionId: question().id,
          topicId: question().topicId,
          learningObjectiveId: question().learningObjectiveId,
          difficultyBand: question().difficultyBand,
          outcome: "wrong"
        }
      ]
    };
    const client = {
      getLearningJournal: vi.fn(async () => ({ journal: cloudJournal })),
      saveLearningJournal: vi.fn(async (journal) => ({ journal })),
      clearLearningJournal: vi.fn(async () => {
        cloudJournal = createLanternJournal();
      })
    };
    const continuity = createJournalContinuity({
      client,
      storage: {
        getItem: () => null,
        removeItem: () => {},
        setItem: () => {
          throw new Error("storage denied");
        }
      }
    });

    await continuity.selectUser("user_a");
    expect(continuity.getJournal().events).toHaveLength(1);
    continuity.clear();
    await continuity.whenIdle();

    expect(client.clearLearningJournal).toHaveBeenCalledOnce();
    expect(continuity.getJournal().events).toHaveLength(0);
    expect(cloudJournal.events).toHaveLength(0);
  });

  it("migrates guest learning once into the selected authenticated account", async () => {
    const storage = createStorage();
    const client = {
      getLearningJournal: vi.fn(async () => ({ journal: createLanternJournal() })),
      saveLearningJournal: vi.fn(async (journal) => ({ journal })),
      clearLearningJournal: vi.fn(async () => ({}))
    };
    const continuity = createJournalContinuity({ client, storage });

    await continuity.selectUser("");
    continuity.record(question(), "wrong", () => eventId(1));
    await continuity.selectUser("user_a");
    await continuity.whenIdle();

    expect(continuity.getJournal().events).toHaveLength(1);
    expect(client.saveLearningJournal).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [expect.objectContaining({ eventId: eventId(1) })]
      })
    );

    await continuity.selectUser("");
    expect(continuity.getJournal().events).toHaveLength(0);
  });

  it("never exposes one authenticated account journal to another", async () => {
    const storage = createStorage();
    const cloudByUser = new Map([
      ["user_a", createLanternJournal()],
      ["user_b", createLanternJournal()]
    ]);
    let selectedUser = "";
    const client = {
      getLearningJournal: vi.fn(async () => ({
        journal: cloudByUser.get(selectedUser) ?? createLanternJournal()
      })),
      saveLearningJournal: vi.fn(async (journal) => {
        cloudByUser.set(selectedUser, journal);
        return { journal };
      }),
      clearLearningJournal: vi.fn(async () => {
        cloudByUser.set(selectedUser, createLanternJournal());
      })
    };
    const continuity = createJournalContinuity({ client, storage });

    selectedUser = "user_a";
    await continuity.selectUser(selectedUser);
    continuity.record(question(), "wrong", () => eventId(2));
    await continuity.whenIdle();

    selectedUser = "user_b";
    await continuity.selectUser(selectedUser);
    expect(continuity.getJournal().events).toHaveLength(0);
  });

  it("ignores a stale cloud response after account switching", async () => {
    /** @type {(value: unknown) => void} */
    let resolveUserA = () => {};
    const userACloud = new Promise((resolve) => {
      resolveUserA = resolve;
    });
    let selectedUser = "user_a";
    const client = {
      getLearningJournal: vi.fn(() =>
        selectedUser === "user_a"
          ? userACloud
          : Promise.resolve({ journal: createLanternJournal() })
      ),
      saveLearningJournal: vi.fn(async (journal) => ({ journal })),
      clearLearningJournal: vi.fn(async () => ({}))
    };
    const continuity = createJournalContinuity({
      client,
      storage: createStorage()
    });

    const selectingA = continuity.selectUser("user_a");
    selectedUser = "user_b";
    const selectingB = continuity.selectUser("user_b");
    continuity.record(question(1), "correct", () => eventId(3));
    resolveUserA({
      journal: {
        version: 1,
        events: [
          {
            eventId: eventId(4),
            questionId: question().id,
            topicId: question().topicId,
            learningObjectiveId: question().learningObjectiveId,
            difficultyBand: question().difficultyBand,
            outcome: "wrong"
          }
        ]
      }
    });
    await Promise.all([selectingA, selectingB, continuity.whenIdle()]);

    expect(continuity.getJournal().events.map((event) => event.eventId)).toEqual([
      eventId(3)
    ]);
  });

  it("does not restore a clear made during an in-flight cloud read", async () => {
    /** @type {(value: unknown) => void} */
    let resolveCloud = () => {};
    const cloudRead = new Promise((resolve) => {
      resolveCloud = resolve;
    });
    const cloudJournal = {
      version: 1,
      events: [
        {
          eventId: eventId(5),
          questionId: question().id,
          topicId: question().topicId,
          learningObjectiveId: question().learningObjectiveId,
          difficultyBand: question().difficultyBand,
          outcome: "wrong"
        }
      ]
    };
    const client = {
      getLearningJournal: vi.fn(() => cloudRead),
      saveLearningJournal: vi.fn(async (journal) => ({ journal })),
      clearLearningJournal: vi.fn(async () => ({}))
    };
    const continuity = createJournalContinuity({
      client,
      storage: createStorage()
    });

    const selecting = continuity.selectUser("user_a");
    continuity.clear();
    resolveCloud({ journal: cloudJournal });
    await Promise.all([selecting, continuity.whenIdle()]);

    expect(continuity.getJournal().events).toHaveLength(0);
    expect(client.clearLearningJournal).toHaveBeenCalledOnce();
    expect(client.saveLearningJournal).not.toHaveBeenCalled();
  });

  it("keeps an offline clear pending and suppresses cloud restoration", async () => {
    const storage = createStorage();
    let offline = true;
    const cloud = {
      journal: {
        version: 1,
        events: [
          {
            eventId: eventId(6),
            questionId: question().id,
            topicId: question().topicId,
            learningObjectiveId: question().learningObjectiveId,
            difficultyBand: question().difficultyBand,
            outcome: "wrong"
          }
        ]
      }
    };
    const client = {
      getLearningJournal: vi.fn(async () => cloud),
      saveLearningJournal: vi.fn(async (journal) => ({ journal })),
      clearLearningJournal: vi.fn(async () => {
        if (offline) throw new Error("offline");
        cloud.journal = createLanternJournal();
      })
    };
    const continuity = createJournalContinuity({ client, storage });

    await continuity.selectUser("user_a");
    expect(continuity.getJournal().events).toHaveLength(1);
    continuity.clear();
    await continuity.whenIdle();
    expect(continuity.getJournal().events).toHaveLength(0);

    await continuity.selectUser("");
    await continuity.selectUser("user_a");
    expect(continuity.getJournal().events).toHaveLength(0);

    offline = false;
    await continuity.retry();
    await continuity.whenIdle();
    expect(cloud.journal.events).toHaveLength(0);
  });
});

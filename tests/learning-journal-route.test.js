import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createLearningJournalHandler } from "../server/learning-journal-route.js";

const JOURNAL = {
  version: 1,
  events: [
    {
      eventId: "event_00000000-0000-4000-8000-000000000101",
      questionId: "scout-capable-0",
      topicId: "arithmetic",
      learningObjectiveId: "scout-equal-groups",
      difficultyBand: "capable",
      outcome: "wrong"
    }
  ]
};

/** @returns {{
 *   journal: unknown,
 *   clearGeneration: number,
 *   getJournal: () => Promise<unknown>,
 *   saveJournal: (userId: string, journal: unknown, clearGeneration: number) => Promise<unknown>,
 *   clearJournal: () => Promise<unknown>
 * }} */
function createStore() {
  return {
    journal: { version: 1, events: [] },
    clearGeneration: 0,
    async getJournal() {
      return {
        journal: this.journal,
        clearGeneration: this.clearGeneration
      };
    },
    /** @param {string} _userId @param {unknown} journal @param {number} clearGeneration */
    async saveJournal(_userId, journal, clearGeneration) {
      this.journal = journal;
      this.clearGeneration = clearGeneration;
      return { journal, clearGeneration };
    },
    async clearJournal() {
      this.journal = { version: 1, events: [] };
      this.clearGeneration += 1;
      return {
        journal: this.journal,
        clearGeneration: this.clearGeneration
      };
    }
  };
}

/**
 * @param {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, next?: () => void) => void | Promise<void>} handler
 * @param {(origin: string) => Promise<void>} callback
 */
async function withServer(handler, callback) {
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(undefined))
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not start.");
  }
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve(undefined)))
    );
  }
}

describe("learning Journal API", () => {
  it("requires authentication", async () => {
    const handler = createLearningJournalHandler({
      store: createStore(),
      getUserId: () => null
    });
    await withServer(handler, async (origin) => {
      expect((await fetch(`${origin}/api/learning-journal`)).status).toBe(401);
    });
  });

  it("saves, reads, and clears only reviewed coarse outcomes", async () => {
    const store = createStore();
    const handler = createLearningJournalHandler({
      store,
      getUserId: () => "user_123"
    });
    await withServer(handler, async (origin) => {
      const saved = await fetch(`${origin}/api/learning-journal`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ journal: JOURNAL, clearGeneration: 0 })
      });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toEqual({
        journal: JOURNAL,
        clearGeneration: 0
      });

      const read = await fetch(`${origin}/api/learning-journal`);
      expect(await read.json()).toEqual({
        journal: JOURNAL,
        clearGeneration: 0
      });

      const cleared = await fetch(`${origin}/api/learning-journal`, {
        method: "DELETE"
      });
      expect(cleared.status).toBe(200);
      expect(await cleared.json()).toEqual({
        journal: { version: 1, events: [] },
        clearGeneration: 1
      });
      expect(store.journal).toMatchObject({ events: [] });
    });
  });

  it("rejects raw child answer data and unexpected fields", async () => {
    const handler = createLearningJournalHandler({
      store: createStore(),
      getUserId: () => "user_123"
    });
    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/learning-journal`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          journal: {
            ...JOURNAL,
            events: [{ ...JOURNAL.events[0], answerText: "child response" }]
          },
          clearGeneration: 0
        })
      });
      expect(response.status).toBe(400);
    });
  });

  it("rejects child data disguised as identifier fields", async () => {
    const handler = createLearningJournalHandler({
      store: createStore(),
      getUserId: () => "user_123"
    });
    await withServer(handler, async (origin) => {
      for (const event of [
        { ...JOURNAL.events[0], eventId: "event_child_said_seven" },
        { ...JOURNAL.events[0], questionId: "child said seven" },
        {
          ...JOURNAL.events[0],
          learningObjectiveId: "scout-equal-sharing"
        }
      ]) {
        const response = await fetch(`${origin}/api/learning-journal`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            journal: { ...JOURNAL, events: [event] },
            clearGeneration: 0
          })
        });
        expect(response.status).toBe(400);
      }
    });
  });

  it("logs only a bounded error class when storage fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createStore();
    store.getJournal = async () => {
      throw new Error("database token must-not-leak");
    };
    const handler = createLearningJournalHandler({
      store,
      getUserId: () => "user_123"
    });

    await withServer(handler, async (origin) => {
      expect((await fetch(`${origin}/api/learning-journal`)).status).toBe(500);
    });
    expect(log).toHaveBeenCalledWith(
      "[learning-journal] API request failed",
      { name: "Error" }
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("must-not-leak");
    log.mockRestore();
  });
});

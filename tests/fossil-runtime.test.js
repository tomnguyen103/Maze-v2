import { describe, expect, it } from "vitest";
import { createFossilCollection } from "../src/game/quest-fossils.js";
import { createFossilRuntime } from "../src/game/fossil-runtime.js";
import { saveRunRecord } from "../src/game/storage.js";

const QUEST_ID = "quest_fossil_runtime_123";

function createStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => values.set(key, value),
    /** @param {string} key */
    removeItem: (key) => values.delete(key)
  };
}

function createFossilApi() {
  return /** @type {ReturnType<typeof import("../src/player/player-client.js").createPlayerApiClient>} */ (
    /** @type {unknown} */ ({
      getFossils: async (/** @type {string} */ questId) => ({
        collection: createFossilCollection(questId)
      }),
      saveFossils: async (/** @type {unknown} */ collection) => ({ collection })
    })
  );
}

describe("Echo Fossil runtime", () => {
  it("keeps terminal completion non-blocking when saved input is unavailable", async () => {
    const runtime = createFossilRuntime({
      playerController: {
        getAuthenticatedUserId: () => null,
        getApiClient: createFossilApi
      },
      storage: createStorage(),
      getQuestId: () => QUEST_ID
    });

    await expect(
      runtime.recordLatestTerminal(false, "missing-run")
    ).resolves.toBeNull();
  });

  it("records the saved terminal run once against its saved Quest", async () => {
    const storage = createStorage();
    saveRunRecord({
      elapsedMs: 70000,
      moves: 70,
      seed: "TERMINAL-RUN",
      outcome: "escaped",
      echoesCollected: 2,
      questId: QUEST_ID,
      questLevelId: "trail-scout",
      labyrinthNumber: 4,
      atlasRegionId: "foundation",
      rulesetRevision: "classic-v1"
    }, storage);
    const runtime = createFossilRuntime({
      playerController: {
        getAuthenticatedUserId: () => null,
        getApiClient: createFossilApi
      },
      storage,
      getQuestId: () => "quest_fossil_runtime_next"
    });

    await runtime.recordLatestTerminal(false, "TERMINAL-RUN");
    await runtime.recordLatestTerminal(false, "TERMINAL-RUN");

    expect(runtime.getCollection()).toMatchObject({
      questId: QUEST_ID,
      fossils: [expect.objectContaining({ questId: QUEST_ID })]
    });
  });

  it("does not create a personal Fossil for a Classroom terminal", async () => {
    const storage = createStorage();
    saveRunRecord({
      elapsedMs: 70000,
      moves: 70,
      seed: "CLASSROOM-RUN",
      outcome: "defeated",
      echoesCollected: 0,
      questId: QUEST_ID,
      questLevelId: "trail-scout",
      labyrinthNumber: 4,
      atlasRegionId: "foundation",
      rulesetRevision: "classic-v1"
    }, storage);
    const runtime = createFossilRuntime({
      playerController: {
        getAuthenticatedUserId: () => null,
        getApiClient: createFossilApi
      },
      storage,
      getQuestId: () => QUEST_ID
    });

    await expect(
      runtime.recordLatestTerminal(true, "CLASSROOM-RUN")
    ).resolves.toBeNull();
    expect(runtime.getCollection().fossils).toEqual([]);
  });
});

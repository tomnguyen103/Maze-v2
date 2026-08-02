import { describe, expect, it, vi } from "vitest";
import { createEchoFossil, createFossilCollection } from "../src/game/quest-fossils.js";
import { createFossilContinuity } from "../src/game/fossil-continuity.js";

const QUEST_ID = "quest_fossil_continuity_123";
const FOSSIL = createEchoFossil({
  questId: QUEST_ID,
  labyrinthNumber: 4,
  atlasRegionId: "foundation",
  outcome: "escaped",
  fossilId: "fossil_00000000-0000-4000-8000-000000000101"
});

/** @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => void,
 *   removeItem: (key: string) => void,
 *   has: (key: string) => boolean
 * }} StorageFixture */

/** @returns {StorageFixture} */
function storageFixture() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    has: (key) => values.has(key)
  };
}

function clientFixture() {
  return {
    getFossils: vi.fn(async () => ({
      collection: createFossilCollection(QUEST_ID)
    })),
    saveFossils: vi.fn(async (collection) => ({ collection }))
  };
}

describe("Echo Fossil continuity", () => {
  it("keeps guest and account collections isolated and migrates guest memory once", async () => {
    const storage = storageFixture();
    const client = clientFixture();
    const continuity = createFossilContinuity({ client, storage });

    await continuity.selectUser("", QUEST_ID);
    continuity.record(FOSSIL);
    await continuity.selectUser("user_fossil_a", QUEST_ID);

    expect(continuity.getCollection().fossils).toEqual([FOSSIL]);
    expect(storage.has("echo-maze:echo-fossils:guest:quest_fossil_continuity_123:v1")).toBe(false);
    expect(client.getFossils).toHaveBeenCalledWith(QUEST_ID);

    await continuity.selectUser("user_fossil_b", QUEST_ID);
    expect(continuity.getCollection()).toEqual(
      createFossilCollection(QUEST_ID)
    );
    expect(continuity.getCollection().fossils).not.toContain(FOSSIL);
  });

  it("starts a fresh guest collection for each Quest", async () => {
    const continuity = createFossilContinuity({
      client: clientFixture(),
      storage: storageFixture()
    });

    await continuity.selectUser("", QUEST_ID);
    continuity.record(FOSSIL);
    await continuity.setQuest("quest_fossil_continuity_other");

    expect(continuity.getCollection()).toEqual(
      createFossilCollection("quest_fossil_continuity_other")
    );
  });

  it("writes to cloud only when the terminal boundary queues a collection", async () => {
    const client = clientFixture();
    const continuity = createFossilContinuity({
      client,
      storage: storageFixture()
    });

    await continuity.selectUser("user_fossil_a", QUEST_ID);
    continuity.record(FOSSIL);
    expect(client.saveFossils).not.toHaveBeenCalled();

    await continuity.queueBoundary();
    expect(client.saveFossils).toHaveBeenCalledOnce();
    expect(client.saveFossils).toHaveBeenCalledWith(
      expect.objectContaining({ questId: QUEST_ID, fossils: [FOSSIL] })
    );
  });

  it("keeps the local collection and retries after a cloud failure", async () => {
    /** @type {string[]} */
    const statuses = [];
    const client = clientFixture();
    client.saveFossils
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async (collection) => ({ collection }));
    const continuity = createFossilContinuity({
      client,
      storage: storageFixture(),
      onStatus: (status) => statuses.push(status)
    });

    await continuity.selectUser("user_fossil_a", QUEST_ID);
    continuity.record(FOSSIL);
    await expect(continuity.queueBoundary()).resolves.toBe(false);
    expect(continuity.getCollection().fossils).toEqual([FOSSIL]);
    expect(statuses).toContain("offline");

    await expect(continuity.retry()).resolves.toBe(true);
    expect(statuses.at(-1)).toBe("saved");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  createEchoFossil,
  createFossilCollection
} from "../src/game/quest-fossils.js";
import { createEchoFossilStore } from "../server/echo-fossil-store.js";

const QUEST_ID = "quest_fossil_store_123";
const FOSSIL = createEchoFossil({
  questId: QUEST_ID,
  labyrinthNumber: 4,
  atlasRegionId: "foundation",
  outcome: "escaped",
  fossilId: "fossil_00000000-0000-4000-8000-000000000301"
});
const COLLECTION = { ...createFossilCollection(QUEST_ID), fossils: [FOSSIL] };

/** @param {(sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} query */
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
    clientQuery,
    connect: vi.fn(async () => ({
      query: clientQuery,
      release: vi.fn()
    }))
  };
}

describe("Echo Fossil store", () => {
  it("returns an empty collection for an account without this Quest", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    await expect(
      createEchoFossilStore(tenantPool(query)).getFossils("user_123", QUEST_ID)
    ).resolves.toEqual({ collection: createFossilCollection(QUEST_ID) });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM echo_fossil_collections[\s\S]+quest_id = \$2/),
      ["user_123", QUEST_ID]
    );
  });

  it("ensures active account access and unions a same-Quest collection", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ quest_id: QUEST_ID, collection: COLLECTION }] })
      .mockResolvedValueOnce({ rows: [{ collection: COLLECTION, quest_id: QUEST_ID }] });
    const store = createEchoFossilStore(tenantPool(query));

    await expect(store.saveFossils("user_123", COLLECTION)).resolves.toEqual({
      collection: COLLECTION
    });
    expect(query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    expect(query.mock.calls[1][0]).toMatch(
      /INSERT INTO player_access[\s\S]+INSERT INTO echo_fossil_collections[\s\S]+ON CONFLICT/
    );
    expect(query.mock.calls[1][1]).toEqual([
      "user_123",
      QUEST_ID,
      JSON.stringify(COLLECTION),
      expect.any(String)
    ]);
  });
});

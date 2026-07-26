import { describe, expect, it, vi } from "vitest";
import { createUserDeletionStore } from "../server/user-deletion-store.js";

describe("Clerk user deletion store", () => {
  it("deletes every Clerk-keyed player record in one transaction", async () => {
    const client = {
      query: vi.fn(async (...args) => {
        const [sql] = args;
        return {
          rows: sql.includes("AS tombstone_present") ? [{
              tombstone_present: true,
              cloud_deleted: true,
              player_deleted: true,
              scores_deleted: true,
              access_deleted: true,
              grants_deleted: true,
              purchases_deleted: true,
              journal_deleted: true
            }]
          : []
        };
      }),
      release: vi.fn()
    };
    const store = createUserDeletionStore({
      connect: vi.fn(async () => client)
    });

    await store.deleteUser("user_deleted");

    expect(client.query.mock.calls.map(([sql]) => sql.trim())).toEqual([
      "BEGIN",
      expect.stringContaining("pg_advisory_xact_lock"),
      expect.stringContaining("INSERT INTO deleted_user_tombstones"),
      expect.stringContaining("DELETE FROM cloud_quest_progress"),
      expect.stringContaining("DELETE FROM players"),
      expect.stringContaining("DELETE FROM player_access"),
      expect.stringContaining("AS tombstone_present"),
      "COMMIT"
    ]);
    expect(client.query.mock.calls[1][1]).toEqual(["user_deleted"]);
    expect(client.query.mock.calls[2][1]).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/)
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back when any application-owned record survives verification", async () => {
    const client = {
      query: vi.fn(async (...args) => {
        const [sql] = args;
        return {
          rows: sql.includes("AS tombstone_present") ? [{
              tombstone_present: true,
              cloud_deleted: true,
              player_deleted: true,
              scores_deleted: false,
              access_deleted: true,
              grants_deleted: true,
              purchases_deleted: true,
              journal_deleted: true
            }]
          : []
        };
      }),
      release: vi.fn()
    };
    const store = createUserDeletionStore({
      connect: vi.fn(async () => client)
    });

    await expect(store.deleteUser("user_deleted")).rejects.toThrow(
      "Account deletion verification failed."
    );
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back when deletion fails", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error("database unavailable"))
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn()
    };
    const store = createUserDeletionStore({
      connect: vi.fn(async () => client)
    });

    await expect(store.deleteUser("user_deleted")).rejects.toThrow(
      "database unavailable"
    );
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});

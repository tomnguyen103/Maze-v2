import { describe, expect, it, vi } from "vitest";
import { createUserDeletionStore } from "../server/user-deletion-store.js";

describe("Clerk user deletion store", () => {
  it("deletes every Clerk-keyed player record in one transaction", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
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
      "COMMIT"
    ]);
    expect(client.query.mock.calls[1][1]).toEqual(["user_deleted"]);
    expect(client.query.mock.calls[2][1]).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/)
    ]);
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

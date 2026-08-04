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
              journal_deleted: true,
              settings_deleted: true,
              memberships_deleted: true,
              verified_daily_submissions_deleted: true,
              verified_daily_entries_deleted: true,
              daily_trail_contributions_deleted: true,
              offline_run_receipts_deleted: true,
              offline_pending_submissions_deleted: true,
              echo_fossils_deleted: true,
              roles_deleted: true,
              rate_limit_counters_deleted: true,
              classroom_authority_versions_deleted: true
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
      expect.stringContaining("set_config('echo_maze.explorer_id'"),
      expect.stringContaining("pg_advisory_xact_lock"),
      expect.stringContaining("INSERT INTO deleted_user_tombstones"),
      expect.stringContaining("DELETE FROM cloud_quest_progress"),
      expect.stringContaining("DELETE FROM explorer_access_settings"),
      expect.stringContaining("DELETE FROM echo_fossil_collections"),
      expect.stringContaining("DELETE FROM players"),
      expect.stringContaining("DELETE FROM user_roles"),
      expect.stringContaining("DELETE FROM rate_limit_counters"),
      // Ordered before the Membership rows go: this table records a
      // Membership by its Clerk membership id, so the join back to the
      // Explorer only exists while `classroom_memberships` still does.
      expect.stringContaining("DELETE FROM classroom_authority_versions"),
      expect.stringContaining("DELETE FROM player_access"),
      expect.stringContaining("AS tombstone_present"),
      "COMMIT"
    ]);
    expect(client.query.mock.calls[1][1]).toEqual(["user_deleted", ""]);
    expect(client.query.mock.calls[2][1]).toEqual(["user_deleted"]);
    expect(client.query.mock.calls[3][1]).toEqual([
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
              journal_deleted: true,
              settings_deleted: true,
              memberships_deleted: true,
              verified_daily_submissions_deleted: true,
              verified_daily_entries_deleted: true,
              daily_trail_contributions_deleted: true,
              offline_run_receipts_deleted: true,
              offline_pending_submissions_deleted: true,
              echo_fossils_deleted: true,
              roles_deleted: true,
              rate_limit_counters_deleted: true,
              classroom_authority_versions_deleted: true
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

  it("destroys the pooled client when rollback fails", async () => {
    const client = {
      query: vi.fn(async (sql) => {
        if (sql === "ROLLBACK") throw new Error("rollback failed");
        if (sql.includes("pg_advisory_xact_lock")) {
          throw new Error("database unavailable");
        }
        return { rows: [] };
      }),
      release: vi.fn()
    };
    const store = createUserDeletionStore({
      connect: vi.fn(async () => client)
    });

    await expect(store.deleteUser("user_deleted")).rejects.toThrow(
      "database unavailable"
    );
    expect(client.release).toHaveBeenCalledWith(true);
    expect(client.release).toHaveBeenCalledOnce();
  });
  it("verifies the Constellation contribution receipt is gone too", async () => {
    /** @type {string[]} */
    const statements = [];
    const client = {
      query: vi.fn(async (...args) => {
        const [sql] = args;
        statements.push(sql);
        return {
          rows: sql.includes("AS tombstone_present") ? [{
              tombstone_present: true,
              cloud_deleted: true,
              player_deleted: true,
              scores_deleted: true,
              access_deleted: true,
              grants_deleted: true,
              purchases_deleted: true,
              journal_deleted: true,
              settings_deleted: true,
              memberships_deleted: true,
              verified_daily_submissions_deleted: true,
              verified_daily_entries_deleted: true,
              daily_trail_contributions_deleted: false,
              offline_run_receipts_deleted: true,
              offline_pending_submissions_deleted: true,
              echo_fossils_deleted: true,
              roles_deleted: true,
              rate_limit_counters_deleted: true,
              classroom_authority_versions_deleted: true
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
    expect(
      statements.find((sql) => sql.includes("AS tombstone_present"))
    ).toContain("FROM daily_trail_contributions");
  });
});

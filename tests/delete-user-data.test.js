import { describe, expect, it, vi } from "vitest";
import { deletedUserHash } from "../server/deleted-user-guard.js";
import {
  deleteUserApplicationData
} from "../scripts/delete-user-data.mjs";

const CONFIRMATION = "DELETE APPLICATION DATA";

function verifiedClient() {
  return {
    query: vi.fn(async (sql) => ({
      rows: sql.includes("AS tombstone_present")
        ? [{
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
    })),
    release: vi.fn()
  };
}

describe("break-glass application-data deletion", () => {
  it("requires both the exact warning and the independently supplied digest", async () => {
    const pool = { connect: vi.fn() };

    await expect(deleteUserApplicationData({
      pool,
      userId: "user_target",
      confirmation: "DELETE",
      confirmationHash: deletedUserHash("user_target")
    })).rejects.toThrow("Deletion confirmation is invalid.");
    await expect(deleteUserApplicationData({
      pool,
      userId: "user_target",
      confirmation: CONFIRMATION,
      confirmationHash: deletedUserHash("user_other")
    })).rejects.toThrow("Deletion confirmation digest does not match.");
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("runs the reviewed deletion transaction without returning identity data", async () => {
    const client = verifiedClient();
    const pool = { connect: vi.fn(async () => client) };

    await expect(deleteUserApplicationData({
      pool,
      userId: "user_target",
      confirmation: CONFIRMATION,
      confirmationHash: deletedUserHash("user_target")
    })).resolves.toBeUndefined();

    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });
});

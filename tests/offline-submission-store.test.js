import { describe, expect, it } from "vitest";
import { createOfflineSubmissionStore } from "../server/offline-submission-store.js";

function createPool() {
  /** @type {string[]} */
  const sql = [];
  const client = {
    async query(/** @type {string} */ statement) {
      sql.push(statement);
      if (statement.includes("read_offline_run_receipt")) {
        return {
          rows: [
            {
              run_id: "offline_run_01J1MOSSWATCH",
              player_id: "user_01MOSS",
              device_installation_hash: "a".repeat(64),
              seed: "MOSS-WATCH-11",
              level_id: "trail-scout",
              labyrinth_number: 4,
              ruleset_revision: "echo-hush-v1",
              content_pack_hash: "b".repeat(64),
              issued_at: new Date("2026-08-01T00:00:00.000Z"),
              play_expires_at: new Date("2026-08-08T00:00:00.000Z"),
              submission_expires_at: new Date("2026-08-10T00:00:00.000Z")
            }
          ]
        };
      }
      if (statement.includes("record_offline_submission")) {
        return {
          rows: [
            {
              state: "recorded",
              recorded_outcome: "won",
              recorded_score: 900,
              recorded_moves: 12,
              recorded_elapsed_ms: 30000
            }
          ]
        };
      }
      if (statement.includes("complete_offline_submission")) {
        return { rows: [{ completed: true }] };
      }
      if (statement.includes("offline_submission_pending_apply")) {
        return { rows: [{ pending: true }] };
      }
      return { rows: [] };
    },
    release() {}
  };
  return {
    sql,
    async query(/** @type {string} */ statement) {
      sql.push(statement);
      if (statement.includes("prune_offline_run_continuity")) {
        return { rows: [{ pruned: 3 }] };
      }
      return { rows: [] };
    },
    connect: async () => client
  };
}

describe("Offline submission store", () => {
  it("uses tenant-scoped migration functions and never stores an action log", async () => {
    const pool = createPool();
    const store = createOfflineSubmissionStore(pool);
    const receipt = await store.readReceipt(
      "user_01MOSS",
      "offline_run_01J1MOSSWATCH",
      "a".repeat(64)
    );
    const recorded = await store.recordSubmission("user_01MOSS", {
      idempotencyKey: "offline_submit_01J1MOSSWATCH",
      runId: "offline_run_01J1MOSSWATCH",
      accepted: true,
      outcome: "won",
      score: 900,
      moves: 12,
      elapsedMs: 30000
    });
    await expect(
      store.completeSubmission("user_01MOSS", "offline_submit_01J1MOSSWATCH")
    ).resolves.toBe(true);
    await expect(
      store.pendingApply("user_01MOSS", "offline_submit_01J1MOSSWATCH")
    ).resolves.toBe(true);
    await expect(store.prune()).resolves.toBe(3);

    expect(receipt).toMatchObject({
      playerId: "user_01MOSS",
      issuedAt: "2026-08-01T00:00:00.000Z"
    });
    expect(recorded).toEqual({
      state: "recorded",
      recorded: {
        outcome: "won",
        score: 900,
        moves: 12,
        elapsedMs: 30000
      }
    });
    expect(pool.sql.join(" ")).not.toContain("actionLog");
    expect(pool.sql.join(" ")).not.toContain("questionRevisionId");
    expect(pool.sql.join(" ")).toContain("prune_offline_run_continuity");
  });
});

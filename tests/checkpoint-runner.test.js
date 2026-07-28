import { describe, expect, it, vi } from "vitest";
import { AUDIT_GENESIS_HASH } from "../server/audit-store.js";
import { checkpointRunner } from "../server/player-api.js";

describe("audit checkpoint runner", () => {
  it("retries service construction after a transient loader failure", async () => {
    const put = vi.fn(async () => {});
    const loadSink = vi.fn()
      .mockRejectedValueOnce(new Error("module unavailable"))
      .mockResolvedValueOnce({
        createConfiguredAuditCheckpointSink: () => ({
          put,
          get: vi.fn()
        })
      });
    const runner = checkpointRunner(
      {
        bucket: "checkpoint-bucket",
        region: "us-east-1",
        accessKeyId: "checkpoint-writer",
        secretAccessKey: "checkpoint-secret",
        signingKey: "checkpoint-secret-".repeat(3),
        retentionDays: 1,
        endpoint: undefined,
        forcePathStyle: false
      },
      {
        query: vi.fn(async () => ({
          rows: [{ max_id: 0, row_hash: AUDIT_GENESIS_HASH }]
        }))
      },
      { loadSink }
    );

    await expect(runner?.()).rejects.toThrow("module unavailable");
    await expect(runner?.()).resolves.toMatchObject({
      maxId: 0,
      rowHash: AUDIT_GENESIS_HASH
    });
    expect(loadSink).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledOnce();
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createConfiguredAuditCheckpointSink,
  loadAuditCheckpointConfig
} from "../server/audit-checkpoint-s3.js";

const runIntegration = process.env.RUN_AUDIT_SINK_INTEGRATION === "1";

describe.runIf(runIntegration)("Audit checkpoint immutable sink", () => {
  it("lists and reads one compliance-retained production-prefix version", async () => {
    const config = loadAuditCheckpointConfig(process.env);
    const testBucket = process.env.AUDIT_CHECKPOINT_TEST_BUCKET;
    if (!config || !testBucket) {
      throw new Error(
        "Checkpoint config and AUDIT_CHECKPOINT_TEST_BUCKET are required."
      );
    }
    const sink = createConfiguredAuditCheckpointSink({
      ...config,
      bucket: testBucket
    });
    const body = JSON.stringify({
      schema: "echo-maze-audit-checkpoint-sink-test/1",
      nonce: randomUUID()
    });
    const key =
      `audit-checkpoints/v1/integration-` +
      `${new Date().toISOString().slice(0, 10)}-${randomUUID()}.json`;
    // COMPLIANCE retention is irrevocable, so test objects use the shortest
    // window that still proves the Object Lock write path.
    const retainUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await sink.put({ key, body, retainUntil });
    await expect(sink.all()).resolves.toEqual(
      expect.arrayContaining([{ key, body }])
    );
  });
});

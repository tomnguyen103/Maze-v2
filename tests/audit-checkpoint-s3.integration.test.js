import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createConfiguredAuditCheckpointSink,
  loadAuditCheckpointConfig
} from "../server/audit-checkpoint-s3.js";

const runIntegration = process.env.RUN_AUDIT_SINK_INTEGRATION === "1";

describe.runIf(runIntegration)("Audit checkpoint immutable sink", () => {
  it("round-trips one compliance-retained object in a dedicated test bucket", async () => {
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
      `echo-maze-integration/${new Date().toISOString().slice(0, 10)}/` +
      `${randomUUID()}.json`;
    const retainUntil = new Date(
      Date.now() + config.retentionDays * 24 * 60 * 60 * 1000
    );

    await sink.put({ key, body, retainUntil });
    await expect(sink.get(key)).resolves.toBe(body);
  });
});

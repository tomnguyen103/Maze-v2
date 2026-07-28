import { describe, expect, it, vi } from "vitest";
import {
  AuditCheckpointExistsError,
  createS3AuditCheckpointSink,
  loadAuditCheckpointConfig
} from "../server/audit-checkpoint-s3.js";

const CONFIG_ENV = {
  AUDIT_CHECKPOINT_BUCKET: "echo-maze-audit",
  AUDIT_CHECKPOINT_REGION: "us-east-1",
  AUDIT_CHECKPOINT_ACCESS_KEY_ID: "checkpoint-writer",
  AUDIT_CHECKPOINT_SECRET_ACCESS_KEY: "checkpoint-secret",
  AUDIT_CHECKPOINT_HMAC_KEY: "hmac-secret-".repeat(3),
  AUDIT_CHECKPOINT_RETENTION_DAYS: "30"
};

describe("audit checkpoint S3 adapter", () => {
  it("requires the complete explicit checkpoint configuration", () => {
    expect(loadAuditCheckpointConfig({})).toBeNull();
    expect(loadAuditCheckpointConfig(CONFIG_ENV)).toMatchObject({
      bucket: "echo-maze-audit",
      region: "us-east-1",
      retentionDays: 30
    });
    expect(() =>
      loadAuditCheckpointConfig({
        ...CONFIG_ENV,
        AUDIT_CHECKPOINT_SECRET_ACCESS_KEY: ""
      })
    ).toThrow("configuration is incomplete");
    expect(() =>
      loadAuditCheckpointConfig({
        AUDIT_CHECKPOINT_ENDPOINT: "http://127.0.0.1:9000"
      })
    ).toThrow("configuration is incomplete");
    expect(() =>
      loadAuditCheckpointConfig({
        AUDIT_CHECKPOINT_FORCE_PATH_STYLE: "true"
      })
    ).toThrow("configuration is incomplete");
    expect(() =>
      loadAuditCheckpointConfig({
        AUDIT_CHECKPOINT_FORCE_PATH_STYLE: "false"
      })
    ).toThrow("configuration is incomplete");
    expect(() =>
      loadAuditCheckpointConfig({
        ...CONFIG_ENV,
        AUDIT_CHECKPOINT_FORCE_PATH_STYLE: "sometimes"
      })
    ).toThrow("must be true or false");
  });

  it("writes with create-only and Object Lock compliance controls", async () => {
    const send = vi.fn(async (/** @type {unknown} */ command) => {
      void command;
      return {};
    });
    const sink = createS3AuditCheckpointSink({
      client: { send },
      bucket: "echo-maze-audit"
    });
    const retainUntil = new Date("2026-08-27T12:00:00.000Z");

    await sink.put({
      key: "audit-checkpoints/v1/checkpoint.json",
      body: "{\"ok\":true}",
      retainUntil
    });

    expect(send).toHaveBeenCalledOnce();
    const command = /** @type {{ input: Record<string, unknown> }} */ (
      send.mock.calls[0]?.[0]
    );
    expect(command.input).toMatchObject({
      Bucket: "echo-maze-audit",
      Key: "audit-checkpoints/v1/checkpoint.json",
      IfNoneMatch: "*",
      ObjectLockMode: "COMPLIANCE",
      ObjectLockRetainUntilDate: retainUntil,
      ContentType: "application/json"
    });
    expect(command.input.ChecksumSHA256).toMatch(
      /^[A-Za-z0-9+/]+={0,2}$/
    );
  });

  it("normalizes a precondition failure into an immutable-key collision", async () => {
    const sink = createS3AuditCheckpointSink({
      client: {
        send: vi.fn(async () => {
          throw Object.assign(new Error("occupied"), {
            name: "PreconditionFailed",
            $metadata: { httpStatusCode: 412 }
          });
        })
      },
      bucket: "echo-maze-audit"
    });

    await expect(
      sink.put({
        key: "audit-checkpoints/v1/checkpoint.json",
        body: "{}",
        retainUntil: new Date("2026-08-27T12:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(AuditCheckpointExistsError);
  });

  it("reads every retained checkpoint version in key order", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Versions: [
          {
            Key: "audit-checkpoints/v1/2026-07-29/0002-b.json",
            VersionId: "version-b"
          },
          {
            Key: "audit-checkpoints/v1/2026-07-28/0001-a.json",
            VersionId: "version-a"
          }
        ],
        DeleteMarkers: [],
        IsTruncated: false
      })
      .mockResolvedValueOnce({
        Body: { transformToString: async () => "{\"max_id\":1}" }
      })
      .mockResolvedValueOnce({
        Body: { transformToString: async () => "{\"max_id\":2}" }
      });
    const sink = createS3AuditCheckpointSink({
      client: { send },
      bucket: "echo-maze-audit"
    });

    await expect(sink.all()).resolves.toEqual([
      {
        key: "audit-checkpoints/v1/2026-07-28/0001-a.json",
        body: "{\"max_id\":1}"
      },
      {
        key: "audit-checkpoints/v1/2026-07-29/0002-b.json",
        body: "{\"max_id\":2}"
      }
    ]);
    const reads = send.mock.calls.slice(1).map(([command]) =>
      /** @type {{ input: Record<string, unknown> }} */ (command).input
    );
    expect(reads).toEqual([
      {
        Bucket: "echo-maze-audit",
        Key: "audit-checkpoints/v1/2026-07-28/0001-a.json",
        VersionId: "version-a"
      },
      {
        Bucket: "echo-maze-audit",
        Key: "audit-checkpoints/v1/2026-07-29/0002-b.json",
        VersionId: "version-b"
      }
    ]);
  });

  it("fails closed when a delete marker can hide a retained checkpoint", async () => {
    const sink = createS3AuditCheckpointSink({
      client: {
        send: vi.fn(async () => ({
          Versions: [],
          DeleteMarkers: [{
            Key: "audit-checkpoints/v1/2026-07-28/0001-a.json",
            VersionId: "deleted-version"
          }],
          IsTruncated: false
        }))
      },
      bucket: "echo-maze-audit"
    });

    await expect(sink.all()).rejects.toThrow("delete marker");
  });

  it("fails closed before reading an oversized checkpoint body", async () => {
    const sink = createS3AuditCheckpointSink({
      client: {
        send: vi.fn(async () => ({
          ContentLength: 5000,
          Body: { transformToString: async () => "x".repeat(5000) }
        }))
      },
      bucket: "echo-maze-audit"
    });

    await expect(
      sink.get("audit-checkpoints/v1/2026-07-28/0001-a.json")
    ).rejects.toThrow("exceeds");
  });

  it("fails closed when the retained checkpoint count exceeds its bound", async () => {
    const sink = createS3AuditCheckpointSink({
      client: {
        send: vi.fn(async () => ({
          Versions: Array.from({ length: 4097 }, (_, index) => ({
            Key: `audit-checkpoints/v1/2026-07-28/${String(index).padStart(20, "0")}-a.json`,
            VersionId: `version-${index}`
          })),
          IsTruncated: false
        }))
      },
      bucket: "echo-maze-audit"
    });

    await expect(sink.all()).rejects.toThrow("count exceeds");
  });
});

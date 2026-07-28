import { describe, expect, it, vi } from "vitest";
import {
  AUDIT_CHECKPOINT_SCHEMA,
  AuditCheckpointExistsError,
  auditCheckpointKey,
  buildAuditCheckpoint,
  createAuditCheckpointService,
  verifyAuditCheckpoint,
  verifyAuditCheckpointAnchor,
  verifyRetainedAuditCheckpoints
} from "../server/audit-checkpoint.js";

const SIGNING_KEY = "checkpoint-secret-".repeat(3);
const ROW_HASH = "a".repeat(64);
const NOW = new Date("2026-07-28T12:00:00.000Z");

describe("audit checkpoints", () => {
  it("signs only the anchored chain position with HMAC-SHA256", () => {
    const checkpoint = buildAuditCheckpoint({
      maxId: 42,
      rowHash: ROW_HASH,
      signingKey: SIGNING_KEY,
      createdAt: NOW
    });

    expect(checkpoint).toMatchObject({
      schema: AUDIT_CHECKPOINT_SCHEMA,
      algorithm: "hmac-sha256",
      created_at: NOW.toISOString(),
      max_id: 42,
      row_hash: ROW_HASH
    });
    expect(checkpoint.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyAuditCheckpoint(checkpoint, SIGNING_KEY)).toEqual({
      valid: true
    });
    expect(
      verifyAuditCheckpoint({ ...checkpoint, max_id: 43 }, SIGNING_KEY)
    ).toEqual({ valid: false, reason: "signature" });
  });

  it("uses one immutable key per UTC day and anchored row/hash", () => {
    const checkpoint = buildAuditCheckpoint({
      maxId: 42,
      rowHash: ROW_HASH,
      signingKey: SIGNING_KEY,
      createdAt: NOW
    });
    expect(auditCheckpointKey(checkpoint)).toBe(
      `audit-checkpoints/v1/2026-07-28/${"42".padStart(20, "0")}-${ROW_HASH}.json`
    );
    const nextDay = buildAuditCheckpoint({
      maxId: 42,
      rowHash: ROW_HASH,
      signingKey: SIGNING_KEY,
      createdAt: new Date("2026-07-29T00:00:00.000Z")
    });
    expect(auditCheckpointKey(nextDay)).toBe(
      `audit-checkpoints/v1/2026-07-29/${"42".padStart(20, "0")}-${ROW_HASH}.json`
    );
  });

  it("reads the committed head and writes one compliance-retained document", async () => {
    const put = vi.fn(
      async (/** @type {{ key: string, body: string, retainUntil: Date }} */ input) => {
        void input;
      }
    );
    const service = createAuditCheckpointService({
      query: vi.fn(async () => ({
        rows: [{ max_id: "42", row_hash: ROW_HASH }]
      })),
      sink: { put, get: vi.fn() },
      signingKey: SIGNING_KEY,
      retentionDays: 30,
      now: () => NOW
    });

    await expect(service.create()).resolves.toMatchObject({
      maxId: 42,
      rowHash: ROW_HASH,
      duplicate: false
    });
    expect(put).toHaveBeenCalledOnce();
    const written = put.mock.calls[0]?.[0];
    expect(written).toMatchObject({
      key: expect.stringContaining(ROW_HASH),
      retainUntil: new Date("2026-08-27T12:00:00.000Z")
    });
    expect(JSON.parse(written?.body ?? "{}")).toMatchObject({
      max_id: 42,
      row_hash: ROW_HASH
    });
  });

  it("treats an existing verified checkpoint as an idempotent retry", async () => {
    const checkpoint = buildAuditCheckpoint({
      maxId: 42,
      rowHash: ROW_HASH,
      signingKey: SIGNING_KEY,
      createdAt: NOW
    });
    const service = createAuditCheckpointService({
      query: vi.fn(async () => ({
        rows: [{ max_id: 42, row_hash: ROW_HASH }]
      })),
      sink: {
        put: vi.fn(async () => {
          throw new AuditCheckpointExistsError();
        }),
        get: vi.fn(async () => JSON.stringify(checkpoint))
      },
      signingKey: SIGNING_KEY,
      retentionDays: 30,
      now: () => NOW
    });

    await expect(service.create()).resolves.toMatchObject({
      maxId: 42,
      rowHash: ROW_HASH,
      duplicate: true
    });
  });

  it("rejects a mismatched object at an occupied checkpoint key", async () => {
    const service = createAuditCheckpointService({
      query: vi.fn(async () => ({
        rows: [{ max_id: 42, row_hash: ROW_HASH }]
      })),
      sink: {
        put: vi.fn(async () => {
          throw new AuditCheckpointExistsError();
        }),
        get: vi.fn(async () => JSON.stringify({
          ...buildAuditCheckpoint({
            maxId: 41,
            rowHash: "b".repeat(64),
            signingKey: SIGNING_KEY,
            createdAt: NOW
          })
        }))
      },
      signingKey: SIGNING_KEY,
      retentionDays: 30,
      now: () => NOW
    });

    await expect(service.create()).rejects.toThrow(
      "Existing audit checkpoint does not match"
    );
  });

  it("proves the signed checkpoint against the exact database row", async () => {
    const checkpoint = buildAuditCheckpoint({
      maxId: 42,
      rowHash: ROW_HASH,
      signingKey: SIGNING_KEY,
      createdAt: NOW
    });
    const query = vi.fn(async () => ({
      rows: [{ row_hash: ROW_HASH }]
    }));

    await expect(
      verifyAuditCheckpointAnchor({
        checkpoint,
        key: auditCheckpointKey(checkpoint),
        signingKey: SIGNING_KEY,
        query
      })
    ).resolves.toEqual({ valid: true });
    expect(query).toHaveBeenCalledWith(
      "SELECT row_hash FROM audit_events WHERE id = $1",
      [42]
    );
  });

  it("distinguishes a valid signature from a rewritten database anchor", async () => {
    const checkpoint = buildAuditCheckpoint({
      maxId: 42,
      rowHash: ROW_HASH,
      signingKey: SIGNING_KEY,
      createdAt: NOW
    });

    await expect(
      verifyAuditCheckpointAnchor({
        checkpoint,
        key: auditCheckpointKey(checkpoint),
        signingKey: SIGNING_KEY,
        query: vi.fn(async () => ({
          rows: [{ row_hash: "b".repeat(64) }]
        }))
      })
    ).resolves.toEqual({ valid: false, reason: "anchor_mismatch" });
  });

  it("does not let a newer valid checkpoint hide an invalid retained anchor", async () => {
    const older = buildAuditCheckpoint({
      maxId: 41,
      rowHash: "b".repeat(64),
      signingKey: SIGNING_KEY,
      createdAt: new Date("2026-07-27T12:00:00.000Z")
    });
    const newer = buildAuditCheckpoint({
      maxId: 42,
      rowHash: ROW_HASH,
      signingKey: SIGNING_KEY,
      createdAt: NOW
    });
    const objects = [
      {
        key: auditCheckpointKey(older),
        body: JSON.stringify({ ...older, row_hash: "c".repeat(64) })
      },
      {
        key: auditCheckpointKey(newer),
        body: JSON.stringify(newer)
      }
    ];

    await expect(
      verifyRetainedAuditCheckpoints({
        objects,
        signingKey: SIGNING_KEY,
        query: vi.fn()
      })
    ).resolves.toEqual({
      valid: false,
      reason: "signature",
      key: auditCheckpointKey(older),
      checked: 1
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  AUDIT_GENESIS_HASH,
  auditEventFields,
  auditRowHash,
  canonicalAuditJson,
  createAuditStore,
  readAuditChain,
  verifyAuditChain
} from "../server/audit-store.js";
import { hashClientAddress } from "../server/request-identity.js";

/**
 * @param {{ rows?: Record<string, unknown>[][] }} [options]
 */
function createFakePool(options = {}) {
  /** @type {{ sql: string, values: unknown[] }[]} */
  const calls = [];
  /** @type {Record<string, unknown>[]} */
  const inserted = [];
  let head = AUDIT_GENESIS_HASH;
  return {
    calls,
    inserted,
    /**
     * @param {string} sql
     * @param {unknown[]} [values]
     */
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("append_audit_event")) {
        const fields = JSON.parse(String(values[0]));
        const canonicalPayload = canonicalAuditJson(fields);
        const rowHash = auditRowHash(head, fields);
        const row = {
          ...fields,
          canonical_payload: canonicalPayload,
          prev_hash: head,
          row_hash: rowHash
        };
        inserted.push(row);
        head = rowHash;
        return { rows: [{ id: inserted.length, ...row }] };
      }
      return { rows: options.rows?.shift() ?? [] };
    }
  };
}

const sampleEvent = {
  actorId: "user_1",
  actorRole: "player",
  action: "profile.update",
  resourceType: "player_profile",
  resourceId: "user_1",
  before: { username: "Old" },
  after: { username: "New" },
  requestId: "req_1",
  ipHash: "a".repeat(64),
  createdAt: "2026-07-26T12:00:00.000Z"
};

describe("canonicalAuditJson", () => {
  it("orders keys deterministically at every depth", () => {
    expect(
      canonicalAuditJson({ b: 1, a: { d: [3, { f: 1, e: 2 }], c: null } })
    ).toBe('{"a":{"c":null,"d":[3,{"e":2,"f":1}]},"b":1}');
  });

  it("produces identical output for differently ordered equal objects", () => {
    expect(canonicalAuditJson({ x: 1, y: 2 })).toBe(
      canonicalAuditJson({ y: 2, x: 1 })
    );
  });
});

describe("auditEventFields", () => {
  it("normalizes an event into the exact hashed field set", () => {
    expect(Object.keys(auditEventFields(sampleEvent))).toEqual([
      "action",
      "actor_id",
      "actor_role",
      "after",
      "before",
      "created_at",
      "ip_hash",
      "request_id",
      "resource_id",
      "resource_type"
    ]);
  });

  it("defaults optional fields to null and the role to player", () => {
    expect(
      auditEventFields({
        actorId: "system",
        action: "user.delete",
        resourceType: "player",
        createdAt: "2026-07-26T12:00:00.000Z"
      })
    ).toEqual({
      action: "user.delete",
      actor_id: "system",
      actor_role: "player",
      after: null,
      before: null,
      created_at: "2026-07-26T12:00:00.000Z",
      ip_hash: null,
      request_id: null,
      resource_id: null,
      resource_type: "player"
    });
  });
});

describe("auditRowHash", () => {
  it("is a stable 64 character hex digest", () => {
    const hash = auditRowHash(AUDIT_GENESIS_HASH, auditEventFields(sampleEvent));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      auditRowHash(AUDIT_GENESIS_HASH, auditEventFields(sampleEvent))
    ).toBe(hash);
  });

  it("changes when the previous hash changes", () => {
    expect(
      auditRowHash("b".repeat(64), auditEventFields(sampleEvent))
    ).not.toBe(auditRowHash(AUDIT_GENESIS_HASH, auditEventFields(sampleEvent)));
  });

  it("changes when any hashed field changes", () => {
    expect(
      auditRowHash(
        AUDIT_GENESIS_HASH,
        auditEventFields({ ...sampleEvent, action: "profile.delete" })
      )
    ).not.toBe(auditRowHash(AUDIT_GENESIS_HASH, auditEventFields(sampleEvent)));
  });
});

describe("hashClientIp", () => {
  it("never returns the raw address", () => {
    const hash = hashClientAddress("203.0.113.7", {
      salt: "salt",
      date: "2026-07-26"
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("203");
  });

  it("rotates daily so addresses are not linkable across days", () => {
    expect(
      hashClientAddress("203.0.113.7", { salt: "salt", date: "2026-07-26" })
    ).not.toBe(
      hashClientAddress("203.0.113.7", { salt: "salt", date: "2026-07-27" })
    );
  });

  it("returns null without an address", () => {
    expect(hashClientAddress(null, { salt: "salt", date: "2026-07-26" })).toBeNull();
  });
});

describe("verifyAuditChain", () => {
  it("accepts an empty chain", () => {
    expect(verifyAuditChain([])).toEqual({ valid: true, checked: 0 });
  });

  it("accepts a chain built by appendAudit", async () => {
    const pool = createFakePool();
    const store = createAuditStore(pool);
    await store.appendAudit({ ...sampleEvent, action: "profile.update" });
    await store.appendAudit({ ...sampleEvent, action: "journal.clear" });
    /** @type {Record<string, unknown>[]} */
    const rows = pool.inserted.map((row, index) => ({ id: index + 1, ...row }));
    expect(verifyAuditChain(rows)).toEqual({ valid: true, checked: 2 });
  });

  it("detects a mutated field", async () => {
    const pool = createFakePool();
    const store = createAuditStore(pool);
    await store.appendAudit(sampleEvent);
    await store.appendAudit({ ...sampleEvent, action: "journal.clear" });
    /** @type {Record<string, unknown>[]} */
    const rows = pool.inserted.map((row, index) => ({ id: index + 1, ...row }));
    rows[1].action = "role.grant";
    expect(verifyAuditChain(rows)).toEqual({
      valid: false,
      checked: 2,
      brokenAt: 2,
      reason: "row_hash"
    });
  });

  it("detects a deleted row through the broken prev_hash link", async () => {
    const pool = createFakePool();
    const store = createAuditStore(pool);
    await store.appendAudit(sampleEvent);
    await store.appendAudit({ ...sampleEvent, action: "journal.clear" });
    await store.appendAudit({ ...sampleEvent, action: "role.grant" });
    /** @type {Record<string, unknown>[]} */
    const rows = pool.inserted.map((row, index) => ({ id: index + 1, ...row }));
    const withoutMiddle = [rows[0], rows[2]];
    expect(verifyAuditChain(withoutMiddle)).toEqual({
      valid: false,
      checked: 2,
      brokenAt: 3,
      reason: "prev_hash"
    });
  });

  it("rejects a first row that does not start from the genesis hash", () => {
    expect(
      verifyAuditChain([
        {
          id: 1,
          ...auditEventFields(sampleEvent),
          prev_hash: "c".repeat(64),
          row_hash: "d".repeat(64)
        }
      ])
    ).toEqual({
      valid: false,
      checked: 1,
      brokenAt: 1,
      reason: "prev_hash"
    });
  });

  it("continues a batched walk from a supplied chain hash", async () => {
    const pool = createFakePool();
    const store = createAuditStore(pool);
    await store.appendAudit(sampleEvent);
    await store.appendAudit({ ...sampleEvent, action: "journal.clear" });
    /** @type {Record<string, unknown>[]} */
    const rows = pool.inserted.map((row, index) => ({ id: index + 1, ...row }));
    expect(
      verifyAuditChain([rows[1]], {
        expectedPrevHash: String(rows[0].row_hash)
      })
    ).toEqual({ valid: true, checked: 1 });
    expect(
      verifyAuditChain([rows[1]], { expectedPrevHash: "e".repeat(64) })
    ).toEqual({
      valid: false,
      checked: 1,
      brokenAt: 2,
      reason: "prev_hash"
    });
  });

  it("accepts TIMESTAMPTZ values returned as Date objects", async () => {
    const pool = createFakePool();
    const store = createAuditStore(pool);
    await store.appendAudit(sampleEvent);
    const rows = pool.inserted.map((row, index) => ({
      id: index + 1,
      ...row,
      created_at: new Date(String(row.created_at))
    }));
    expect(verifyAuditChain(rows)).toEqual({ valid: true, checked: 1 });
  });
});

describe("createAuditStore", () => {
  it("delegates one canonical payload to the privileged append function", async () => {
    const pool = createFakePool();
    await createAuditStore(pool).appendAudit(sampleEvent);
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0].sql).toContain("append_audit_event");
    expect(pool.calls[0].values).toEqual([
      canonicalAuditJson(auditEventFields(sampleEvent))
    ]);
    expect(pool.calls[0].sql).not.toContain("INSERT INTO audit_events");
    expect(pool.calls[0].sql).not.toContain("UPDATE audit_chain_head");
  });

  it("links each row to the previous row_hash", async () => {
    const pool = createFakePool();
    const store = createAuditStore(pool);
    await store.appendAudit(sampleEvent);
    await store.appendAudit({ ...sampleEvent, action: "journal.clear" });
    expect(pool.inserted[0].prev_hash).toBe(AUDIT_GENESIS_HASH);
    expect(pool.inserted[1].prev_hash).toBe(pool.inserted[0].row_hash);
  });

  it("serializes concurrent appends into one unbroken chain", async () => {
    const pool = createFakePool();
    const store = createAuditStore(pool);
    await Promise.all([
      store.appendAudit({ ...sampleEvent, action: "profile.update" }),
      store.appendAudit({ ...sampleEvent, action: "journal.clear" }),
      store.appendAudit({ ...sampleEvent, action: "role.grant" })
    ]);
    /** @type {Record<string, unknown>[]} */
    const rows = pool.inserted.map((row, index) => ({ id: index + 1, ...row }));
    expect(rows).toHaveLength(3);
    expect(verifyAuditChain(rows)).toEqual({ valid: true, checked: 3 });
  });

  it("rethrows when the privileged append function fails", async () => {
    const failing = {
      async query() {
        throw new Error("append failed");
      }
    };
    await expect(
      createAuditStore(
        /** @type {Parameters<typeof createAuditStore>[0]} */ (
          /** @type {unknown} */ (failing)
        )
      ).appendAudit(sampleEvent)
    ).rejects.toThrow("append failed");
  });

  it("reads the chain in insertion order for verification", async () => {
    const pool = createFakePool({
      rows: [[{ id: 1, prev_hash: AUDIT_GENESIS_HASH }]]
    });
    await createAuditStore(pool).readChain();
    const read = pool.calls.find((call) =>
      call.sql.includes("FROM audit_events")
    );
    expect(read?.sql).toContain("ORDER BY id ASC");
  });

  it("reads the chain through any query handle so one snapshot can span batches", async () => {
    /** @type {{ sql: string, values: unknown[] | undefined }[]} */
    const seen = [];
    await readAuditChain(
      async (sql, values) => {
        seen.push({ sql, values });
        return { rows: [] };
      },
      { afterId: 7, limit: 100 }
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].sql).toContain("ORDER BY id ASC");
    expect(seen[0].values).toEqual([7, 100]);
  });
});

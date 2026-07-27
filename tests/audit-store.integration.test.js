import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import {
  AUDIT_GENESIS_HASH,
  createAuditStore,
  verifyAuditChain
} from "../server/audit-store.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(databaseUrl);
/** @type {Pool | null} */
let pool = null;

/** @param {string} suffix */
const event = (suffix) => ({
  actorId: `audit_integration_${suffix}`,
  actorRole: "player",
  action: "profile.update",
  resourceType: "player_profile",
  resourceId: `audit_integration_${suffix}`,
  before: { username: "Old" },
  after: { username: "New" },
  requestId: `req_${suffix}`,
  ipHash: "a".repeat(64),
  createdAt: new Date().toISOString()
});

describe.runIf(runIntegration)("Audit store on PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString: normalizeDatabaseConnectionString(databaseUrl),
      max: 4
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("appends a verifiable chain and round-trips the hashed fields", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const store = createAuditStore(pool);
    const first = await store.appendAudit(event("one"));
    const second = await store.appendAudit(event("two"));
    expect(String(second.prev_hash)).toBe(String(first.row_hash));

    const rows = await store.readChain({
      afterId: Number(first.id) - 1,
      limit: 2
    });
    expect(
      verifyAuditChain(rows, { expectedPrevHash: String(first.prev_hash) })
    ).toEqual({ valid: true, checked: 2 });
  });

  it("keeps one unbroken chain under concurrent appends", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const store = createAuditStore(pool);
    const before = await pool.query(
      "SELECT row_hash FROM audit_chain_head WHERE id = 1"
    );
    const startHash = String(before.rows[0]?.row_hash ?? AUDIT_GENESIS_HASH);
    const firstId = await pool.query(
      "SELECT COALESCE(MAX(id), 0) + 1 AS next FROM audit_events"
    );
    await Promise.all(
      ["a", "b", "c", "d", "e"].map((suffix) => store.appendAudit(event(suffix)))
    );
    const rows = await store.readChain({
      afterId: Number(firstId.rows[0].next) - 1,
      limit: 10
    });
    expect(rows).toHaveLength(5);
    expect(verifyAuditChain(rows, { expectedPrevHash: startHash })).toEqual({
      valid: true,
      checked: 5
    });
  });

  it("refuses UPDATE and DELETE on the append-only table", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const store = createAuditStore(pool);
    const row = await store.appendAudit(event("immutable"));
    await expect(
      pool.query("UPDATE audit_events SET action = $1 WHERE id = $2", [
        "role.grant",
        row.id
      ])
    ).rejects.toThrow(/append-only/);
    await expect(
      pool.query("DELETE FROM audit_events WHERE id = $1", [row.id])
    ).rejects.toThrow(/append-only/);
    await expect(pool.query("TRUNCATE audit_events")).rejects.toThrow(
      /append-only/
    );
  });
});

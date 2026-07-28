import { describe, expect, it, vi } from "vitest";
import {
  provisionAuditRuntimeRole
} from "../scripts/provision-audit-runtime-role.mjs";

/** @param {{ rows: Record<string, unknown>[] }[]} responses */
function poolWith(responses) {
  /** @type {{ sql: string, values: unknown[] }[]} */
  const queries = [];
  let index = 0;
  const client = {
    /** @param {string} sql @param {unknown[]} [values] */
    async query(sql, values = []) {
      queries.push({ sql, values });
      const next = responses[index] ?? { rows: [] };
      index += 1;
      return next;
    },
    release: vi.fn()
  };
  return {
    queries,
    client,
    pool: { connect: vi.fn(async () => client) }
  };
}

const SAFE_ROLE = {
  rolcanlogin: true,
  rolsuper: false,
  rolcreaterole: false,
  rolcreatedb: false,
  rolreplication: false,
  rolbypassrls: false,
  audit_owner_member: false
};

describe("audit runtime-role provisioning", () => {
  it("grants only the runtime group and verifies the negative privileges", async () => {
    const fake = poolWith([
      { rows: [SAFE_ROLE] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      {
        rows: [{
          runtime_member: true,
          can_append: true,
          can_read_events: true,
          can_read_head: true,
          can_insert_events: false,
          can_update_events: false,
          can_delete_events: false,
          can_truncate_events: false,
          can_update_head: false,
          public_execute_revoked: true
        }]
      },
      { rows: [] }
    ]);

    await expect(
      provisionAuditRuntimeRole({
        pool: fake.pool,
        runtimeLogin: "echo_maze_app"
      })
    ).resolves.toBeUndefined();

    expect(fake.queries.map(({ sql }) => sql.trim().split(/\s+/)[0])).toEqual([
      "SELECT",
      "BEGIN",
      "REVOKE",
      "REVOKE",
      "REVOKE",
      "REVOKE",
      "GRANT",
      "REVOKE",
      "SELECT",
      "COMMIT"
    ]);
    expect(fake.queries[2].sql).toBe(
      'REVOKE ALL ON TABLE audit_events FROM "echo_maze_app"'
    );
    expect(fake.queries[3].sql).toBe(
      'REVOKE ALL ON TABLE audit_chain_head FROM "echo_maze_app"'
    );
    expect(fake.queries[4].sql).toBe(
      'REVOKE ALL ON SEQUENCE audit_events_id_seq FROM "echo_maze_app"'
    );
    expect(fake.queries[5].sql).toBe(
      'REVOKE ALL ON FUNCTION append_audit_event(TEXT) FROM "echo_maze_app"'
    );
    expect(fake.queries[6].sql).toBe(
      'GRANT echo_maze_runtime TO "echo_maze_app"'
    );
    expect(fake.queries[7].sql).toBe(
      "REVOKE EXECUTE ON FUNCTION append_audit_event(TEXT) FROM PUBLIC"
    );
    expect(JSON.stringify(fake.queries)).not.toContain("DATABASE_ADMIN_URL");
    expect(fake.client.release).toHaveBeenCalledOnce();
  });

  it("refuses a powerful runtime login before changing membership", async () => {
    const fake = poolWith([
      { rows: [{ ...SAFE_ROLE, rolsuper: true }] }
    ]);

    await expect(
      provisionAuditRuntimeRole({
        pool: fake.pool,
        runtimeLogin: "echo_maze_app"
      })
    ).rejects.toThrow("must be an unprivileged login");
    expect(fake.queries).toHaveLength(1);
  });

  it("rejects unsafe role identifiers without opening a connection", async () => {
    const pool = { connect: vi.fn() };
    await expect(
      provisionAuditRuntimeRole({
        pool,
        runtimeLogin: 'app"; DROP TABLE audit_events; --'
      })
    ).rejects.toThrow("runtime login is invalid");
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rolls back when the post-grant privilege proof is unsafe", async () => {
    const fake = poolWith([
      { rows: [SAFE_ROLE] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      {
        rows: [{
          runtime_member: true,
          can_append: true,
          can_read_events: true,
          can_read_head: true,
          can_insert_events: true,
          can_update_events: false,
          can_delete_events: false,
          can_truncate_events: false,
          can_update_head: false,
          public_execute_revoked: true
        }]
      },
      { rows: [] }
    ]);

    await expect(
      provisionAuditRuntimeRole({
        pool: fake.pool,
        runtimeLogin: "echo_maze_app"
      })
    ).rejects.toThrow("privilege verification failed");
    expect(fake.queries.at(-1)?.sql).toBe("ROLLBACK");
  });
});

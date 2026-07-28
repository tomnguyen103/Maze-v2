import { describe, expect, it, vi } from "vitest";
import {
  setTenantContext,
  withTenantContext
} from "../server/tenant-context.js";

function fakePool() {
  /** @type {{ sql: string, values: unknown[] }[]} */
  const calls = [];
  const client = {
    /** @param {string} sql @param {unknown[]} [values] */
    query: vi.fn(async (sql, values = []) => {
      calls.push({ sql, values });
      return { rows: [] };
    }),
    release: vi.fn()
  };
  return {
    calls,
    client,
    pool: { connect: vi.fn(async () => client) }
  };
}

describe("tenant transaction context", () => {
  it("sets transaction-local Personal Play identity and commits", async () => {
    const fake = fakePool();

    await expect(
      withTenantContext(
        fake.pool,
        { explorerId: "user_123", classroomId: null },
        async (client) => {
          await client.query("SELECT 'personal'");
          return "done";
        }
      )
    ).resolves.toBe("done");

    expect(fake.calls.map(({ sql }) => sql.trim().split(/\s+/)[0])).toEqual([
      "BEGIN",
      "SELECT",
      "SELECT",
      "COMMIT"
    ]);
    expect(fake.calls[1].sql).toContain("set_config");
    expect(fake.calls[1].values).toEqual(["user_123", ""]);
    expect(fake.client.release).toHaveBeenCalledOnce();
  });

  it("sets the selected Classroom only for the active transaction", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await setTenantContext(
      { query },
      { explorerId: "user_123", classroomId: "org_class_123" }
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("set_config"), [
      "user_123",
      "org_class_123"
    ]);
  });

  it("rolls back and releases when tenant work fails", async () => {
    const fake = fakePool();
    const failure = new Error("tenant write failed");

    await expect(
      withTenantContext(
        fake.pool,
        { explorerId: "user_123", classroomId: "org_class_123" },
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);

    expect(fake.calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(fake.client.release).toHaveBeenCalledOnce();
  });
});

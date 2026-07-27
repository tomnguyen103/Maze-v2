import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createRoleStore } from "../server/rbac.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(databaseUrl);
/** @type {Pool | null} */
let pool = null;

/** @param {import("pg").PoolClient} client */
const adapterFor = (client) => ({
  /**
   * @param {string} sql
   * @param {unknown[]} [values]
   */
  async query(sql, values) {
    const result = await client.query(sql, values);
    return {
      rows: /** @type {Record<string, unknown>[]} */ (result.rows)
    };
  }
});

describe.runIf(runIntegration)("Role store on PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString: normalizeDatabaseConnectionString(databaseUrl),
      max: 1
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("round-trips a grant, an upgrade, and a revocation", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const store = createRoleStore(adapterFor(client));
      await expect(store.getRole("rbac_integration_1")).resolves.toBe("player");

      await expect(
        store.setRole({
          userId: "rbac_integration_1",
          role: "moderator",
          grantedBy: "rbac_integration_admin"
        })
      ).resolves.toEqual({ previousRole: "player", role: "moderator" });
      await expect(store.getRole("rbac_integration_1")).resolves.toBe(
        "moderator"
      );

      await expect(
        store.setRole({
          userId: "rbac_integration_1",
          role: "admin",
          grantedBy: "rbac_integration_admin"
        })
      ).resolves.toEqual({ previousRole: "moderator", role: "admin" });

      await expect(
        store.setRole({
          userId: "rbac_integration_1",
          role: "player",
          grantedBy: "rbac_integration_admin"
        })
      ).resolves.toEqual({ previousRole: "admin", role: "player" });
      await expect(store.getRole("rbac_integration_1")).resolves.toBe("player");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("refuses a role outside the matrix at the database layer too", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(
        client.query(
          "INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1, $2, $3)",
          ["rbac_integration_2", "owner", "rbac_integration_admin"]
        )
      ).rejects.toThrow();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("refuses a self-grant at the database layer", async () => {
    // The route refuses this too. This is the backstop that holds even if a
    // future call site forgets.
    if (!pool) throw new Error("Database pool was not initialized.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(
        client.query(
          "INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1, $2, $1)",
          ["rbac_integration_3", "admin"]
        )
      ).rejects.toThrow();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("allows the bootstrap actor to grant the first admin to itself", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(
        client.query(
          "INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1, $2, $3)",
          ["system:bootstrap", "admin", "system:bootstrap"]
        )
      ).resolves.toBeTruthy();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});

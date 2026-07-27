import { describe, expect, it, vi } from "vitest";
import {
  createPermissionGuard,
  createRoleResolver,
  createRoleStore,
  publicAccess,
  RoleWriteError
} from "../server/rbac.js";

/** @param {{ rows?: Record<string, unknown>[] }} [options] */
function createFakePool(options = {}) {
  /** @type {{ sql: string, values: unknown[] }[]} */
  const calls = [];
  /** @type {Map<string, string>} */
  const roles = new Map();
  return {
    calls,
    roles,
    /**
     * @param {string} sql
     * @param {unknown[]} [values]
     */
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT role FROM user_roles")) {
        const role = roles.get(String(values[0]));
        return { rows: role ? [{ role }] : (options.rows ?? []) };
      }
      if (sql.includes("DELETE FROM user_roles")) {
        roles.delete(String(values[0]));
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO user_roles")) {
        roles.set(String(values[0]), String(values[1]));
        return { rows: [] };
      }
      return { rows: [] };
    }
  };
}

const request = () =>
  /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ ({ headers: {} })
  );

describe("createRoleStore", () => {
  it("treats a missing row as player", async () => {
    const store = createRoleStore(createFakePool());
    await expect(store.getRole("user_1")).resolves.toBe("player");
  });

  it("treats an unrecognised stored role as player", async () => {
    // A bad write must never widen access.
    const store = createRoleStore(createFakePool({ rows: [{ role: "owner" }] }));
    await expect(store.getRole("user_1")).resolves.toBe("player");
  });

  it("stores a granted role with its granting admin", async () => {
    const pool = createFakePool();
    const store = createRoleStore(pool);
    await expect(
      store.setRole({
        userId: "user_1",
        role: "moderator",
        grantedBy: "admin_1"
      })
    ).resolves.toEqual({ previousRole: "player", role: "moderator" });
    await expect(store.getRole("user_1")).resolves.toBe("moderator");
    const insert = pool.calls.find((call) =>
      call.sql.includes("INSERT INTO user_roles")
    );
    expect(insert?.values).toEqual(["user_1", "moderator", "admin_1"]);
  });

  it("reports the previous role so the audit row can carry a before value", async () => {
    const store = createRoleStore(createFakePool());
    await store.setRole({
      userId: "user_1",
      role: "admin",
      grantedBy: "admin_1"
    });
    await expect(
      store.setRole({
        userId: "user_1",
        role: "moderator",
        grantedBy: "admin_1"
      })
    ).resolves.toEqual({ previousRole: "admin", role: "moderator" });
  });

  it("revokes by deleting the row rather than storing a redundant player row", async () => {
    const pool = createFakePool();
    const store = createRoleStore(pool);
    await store.setRole({
      userId: "user_1",
      role: "admin",
      grantedBy: "admin_1"
    });
    await expect(
      store.setRole({ userId: "user_1", role: "player", grantedBy: "admin_1" })
    ).resolves.toEqual({ previousRole: "admin", role: "player" });
    expect(
      pool.calls.some((call) => call.sql.includes("DELETE FROM user_roles"))
    ).toBe(true);
    await expect(store.getRole("user_1")).resolves.toBe("player");
  });

  it("refuses a role outside the matrix", async () => {
    const store = createRoleStore(createFakePool());
    await expect(
      store.setRole({ userId: "user_1", role: "owner", grantedBy: "admin_1" })
    ).rejects.toBeInstanceOf(RoleWriteError);
  });
});

describe("createRoleResolver", () => {
  it("resolves the stored role", async () => {
    const store = {
      getRole: async () =>
        /** @type {import("../shared/permissions.js").Role} */ ("admin")
    };
    const resolver = createRoleResolver({ store });
    await expect(
      resolver.roleFor(request(), "user_1")
    ).resolves.toBe("admin");
  });

  it("reads the store once per request per Explorer", async () => {
    const getRole = vi.fn(
      async () => /** @type {import("../shared/permissions.js").Role} */ ("moderator")
    );
    const resolver = createRoleResolver({ store: { getRole } });
    const shared = request();
    await resolver.roleFor(shared, "user_1");
    await resolver.roleFor(shared, "user_1");
    expect(getRole).toHaveBeenCalledTimes(1);
  });

  it("does not cache across requests, so a role change lands immediately", async () => {
    /** @type {import("../shared/permissions.js").Role} */
    let role = "player";
    const resolver = createRoleResolver({ store: { getRole: async () => role } });
    await expect(resolver.roleFor(request(), "user_1")).resolves.toBe("player");
    role = "admin";
    await expect(resolver.roleFor(request(), "user_1")).resolves.toBe("admin");
  });

  it("keeps separate Explorers separate within one request", async () => {
    const resolver = createRoleResolver({
      store: {
        getRole: async (/** @type {string} */ userId) =>
          /** @type {import("../shared/permissions.js").Role} */ (
            userId === "a" ? "admin" : "player"
          )
      }
    });
    const shared = request();
    await expect(resolver.roleFor(shared, "a")).resolves.toBe("admin");
    await expect(resolver.roleFor(shared, "b")).resolves.toBe("player");
  });

  it("fails closed when the role table is unreachable", async () => {
    const onFailure = vi.fn();
    const resolver = createRoleResolver({
      store: {
        getRole: async () => {
          throw new Error("database down");
        }
      },
      onFailure
    });
    await expect(resolver.roleFor(request(), "user_1")).resolves.toBe("player");
    expect(onFailure).toHaveBeenCalledWith({ name: "Error" });
  });
});

/**
 * @param {string | null} userId
 * @param {import("../shared/permissions.js").Role} role
 */
function guardFor(userId, role) {
  return createPermissionGuard({
    getUserId: () => userId,
    resolver: { roleFor: async () => role }
  });
}

describe("requirePermission", () => {
  it("answers 401 when nobody is signed in", async () => {
    const check = guardFor(null, "admin")("users:read");
    await expect(check(request())).resolves.toEqual({
      allowed: false,
      status: 401,
      error: "Sign in to continue."
    });
  });

  it("answers 403 for a signed-in Explorer without the permission", async () => {
    const check = guardFor("user_1", "player")("users:read");
    await expect(check(request())).resolves.toEqual({
      allowed: false,
      status: 403,
      error: "You do not have access to that."
    });
  });

  it("does not describe the permission model in the denial", async () => {
    const denial = await guardFor("user_1", "moderator")("refunds:issue")(
      request()
    );
    expect(JSON.stringify(denial)).not.toContain("refunds:issue");
    expect(JSON.stringify(denial)).not.toContain("moderator");
  });

  it("allows and reports the resolved identity when the role carries it", async () => {
    await expect(
      guardFor("user_1", "admin")("users:roles:write")(request())
    ).resolves.toEqual({ allowed: true, userId: "user_1", role: "admin" });
  });

  it("enforces the whole matrix, role by role and permission by permission", async () => {
    const expectations = /** @type {const} */ ([
      ["admin", "users:roles:write", true],
      ["admin", "refunds:issue", true],
      ["admin", "audit:read", true],
      ["moderator", "questions:write", true],
      ["moderator", "audit:read", true],
      ["moderator", "users:read", true],
      ["moderator", "users:roles:write", false],
      ["moderator", "refunds:issue", false],
      ["moderator", "questions:publish", false],
      ["moderator", "export:any", false],
      ["player", "users:read", false],
      ["player", "audit:read", false],
      ["player", "questions:read", false]
    ]);
    for (const [role, permission, allowed] of expectations) {
      const result = await guardFor("user_1", role)(permission)(request());
      expect({ role, permission, allowed: result.allowed }).toEqual({
        role,
        permission,
        allowed
      });
    }
  });
});

describe("publicAccess", () => {
  it("exposes the role and its permissions for UI gating only", () => {
    expect(publicAccess("moderator")).toEqual({
      role: "moderator",
      permissions: ["audit:read", "questions:read", "questions:write", "users:read"]
    });
  });

  it("exposes nothing for a player", () => {
    expect(publicAccess("player")).toEqual({ role: "player", permissions: [] });
  });
});

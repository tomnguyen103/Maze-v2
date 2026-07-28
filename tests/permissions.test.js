import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLE,
  hasPermission,
  isRole,
  PERMISSIONS,
  permissionsFor,
  ROLE_PERMISSIONS,
  ROLES
} from "../shared/permissions.js";

describe("the permission matrix", () => {
  it("defines exactly the three roles the plan specifies", () => {
    expect([...ROLES]).toEqual(["admin", "moderator", "player"]);
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([
      "admin",
      "moderator",
      "player"
    ]);
  });

  it("defaults to the least privileged role", () => {
    expect(DEFAULT_ROLE).toBe("player");
    expect(ROLE_PERMISSIONS.player).toEqual([]);
  });

  it("gives admin every permission that exists", () => {
    expect([...ROLE_PERMISSIONS.admin].sort()).toEqual([...PERMISSIONS]);
  });

  it("keeps moderator strictly weaker than admin", () => {
    for (const permission of ROLE_PERMISSIONS.moderator) {
      expect(ROLE_PERMISSIONS.admin).toContain(permission);
    }
    expect(ROLE_PERMISSIONS.moderator.length).toBeLessThan(
      ROLE_PERMISSIONS.admin.length
    );
  });

  it("withholds the dangerous permissions from moderator", () => {
    // Granting roles, issuing refunds, publishing content, and exporting
    // another Explorer's data are admin-only on purpose.
    for (const permission of [
      "users:roles:write",
      "refunds:issue",
      "questions:publish",
      "export:any",
      "webhooks:read"
    ]) {
      expect(ROLE_PERMISSIONS.moderator).not.toContain(permission);
      expect(ROLE_PERMISSIONS.admin).toContain(permission);
    }
  });

  it("gives a player no permission at all", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission("player", permission)).toBe(false);
    }
  });
});

describe("isRole", () => {
  it("accepts only the known roles", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("moderator")).toBe(true);
    expect(isRole("player")).toBe(true);
  });

  it("rejects anything else, including near misses", () => {
    for (const value of [
      "ADMIN",
      "owner",
      "",
      null,
      undefined,
      0,
      { role: "admin" },
      ["admin"]
    ]) {
      expect(isRole(value)).toBe(false);
    }
  });
});

describe("hasPermission", () => {
  it("answers from the matrix for a known role", () => {
    expect(hasPermission("admin", "users:roles:write")).toBe(true);
    expect(hasPermission("moderator", "questions:write")).toBe(true);
    expect(hasPermission("moderator", "users:roles:write")).toBe(false);
  });

  it("treats an unknown or missing role as the default, never as elevated", () => {
    // A forged or stale Clerk claim must not widen access.
    for (const value of [null, undefined, "owner", "ADMIN", 1, {}]) {
      expect(hasPermission(value, "users:roles:write")).toBe(false);
      expect(hasPermission(value, "audit:read")).toBe(false);
    }
  });

  it("rejects a permission that does not exist", () => {
    expect(hasPermission("admin", "everything")).toBe(false);
    expect(hasPermission("admin", "")).toBe(false);
  });
});

describe("permissionsFor", () => {
  it("returns the role's permissions", () => {
    expect(permissionsFor("moderator")).toEqual(ROLE_PERMISSIONS.moderator);
  });

  it("returns the default role's permissions for anything unknown", () => {
    expect(permissionsFor("owner")).toEqual([]);
    expect(permissionsFor(undefined)).toEqual([]);
  });
});

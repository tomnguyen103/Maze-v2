import { describe, expect, it } from "vitest";
import { can, isStaff } from "../src/player/can.js";

describe("can", () => {
  it("uses the permission list the server sent", () => {
    const access = { role: "moderator", permissions: ["questions:write"] };
    expect(can(access, "questions:write")).toBe(true);
    expect(can(access, "refunds:issue")).toBe(false);
  });

  it("falls back to the shared matrix when only a role is present", () => {
    expect(can({ role: "admin" }, "refunds:issue")).toBe(true);
    expect(can({ role: "moderator" }, "refunds:issue")).toBe(false);
  });

  it("denies when there is no access payload at all", () => {
    for (const access of [null, undefined, "admin", 1, []]) {
      expect(can(access, "audit:read")).toBe(false);
    }
  });

  it("denies an unknown role rather than guessing", () => {
    expect(can({ role: "owner" }, "audit:read")).toBe(false);
    expect(can({ role: "ADMIN" }, "audit:read")).toBe(false);
  });

  it("trusts the server's list over the role when they disagree", () => {
    // The list is what the server computed for this Explorer. A role string
    // that claims more must not win — and either way this only affects UI.
    expect(can({ role: "admin", permissions: [] }, "refunds:issue")).toBe(false);
  });
});

describe("isStaff", () => {
  it("is true for the roles that can read the audit log", () => {
    expect(isStaff({ role: "admin" })).toBe(true);
    expect(isStaff({ role: "moderator" })).toBe(true);
  });

  it("is false for a player and for a missing payload", () => {
    expect(isStaff({ role: "player" })).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});

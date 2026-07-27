import { describe, expect, it, vi } from "vitest";
import { resolveAdminAccess } from "../src/admin/admin-access.js";

const adminProfile = {
  access: { role: "admin", permissions: ["audit:read", "users:read"] }
};

describe("resolveAdminAccess", () => {
  it("denies without fetching anything when the mirror says player", async () => {
    const loadProfile = vi.fn();
    await expect(
      resolveAdminAccess({ mirroredRole: "player", loadProfile })
    ).resolves.toEqual({ state: "denied", reason: "role" });
    // The whole point of the mirror: deny before a fetch, not after one.
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("denies a signed-out Explorer without fetching", async () => {
    const loadProfile = vi.fn();
    for (const mirroredRole of [null, undefined, "", "owner", 7, {}]) {
      await expect(
        resolveAdminAccess({ mirroredRole, loadProfile })
      ).resolves.toEqual({ state: "denied", reason: "role" });
    }
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("confirms an admin mirror against the profile before allowing", async () => {
    const loadProfile = vi.fn(async () => adminProfile);
    await expect(
      resolveAdminAccess({ mirroredRole: "admin", loadProfile })
    ).resolves.toEqual({ state: "allowed", access: adminProfile.access });
    expect(loadProfile).toHaveBeenCalledTimes(1);
  });

  it("lets a moderator through the mirror check and the profile check", async () => {
    const loadProfile = vi.fn(async () => ({
      access: { role: "moderator", permissions: ["audit:read"] }
    }));
    const result = await resolveAdminAccess({
      mirroredRole: "moderator",
      loadProfile
    });
    expect(result.state).toBe("allowed");
  });

  it("denies when the mirror claims more than the database backs", async () => {
    // The mirror is a hint, never the authority. A forged publicMetadata gets
    // one wasted profile fetch and a denial.
    const loadProfile = vi.fn(async () => ({
      access: { role: "player", permissions: [] }
    }));
    await expect(
      resolveAdminAccess({ mirroredRole: "admin", loadProfile })
    ).resolves.toEqual({ state: "denied", reason: "profile" });
  });

  it("denies rather than guessing when the profile fetch fails", async () => {
    const loadProfile = vi.fn(async () => {
      throw new Error("network");
    });
    await expect(
      resolveAdminAccess({ mirroredRole: "admin", loadProfile })
    ).resolves.toEqual({ state: "denied", reason: "unavailable" });
  });
});

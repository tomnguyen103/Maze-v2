// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAdmin } from "../src/admin/admin-controller.js";

/** @param {unknown} mirroredRole */
function stubClerk(mirroredRole) {
  return { initialize: vi.fn(async () => true), mirroredRole };
}

/** @type {HTMLElement} */
let root;

beforeEach(() => {
  document.body.innerHTML = "<div id='admin-root'></div>";
  root = /** @type {HTMLElement} */ (document.getElementById("admin-root"));
});

describe("the /admin route itself", () => {
  it("is rewritten to the SPA, or a reload lands on a 404 instead of the guard", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        { source: "/admin", destination: "/index.html" }
      ])
    );
  });

  it("is routed to the admin controller by the entry point", () => {
    const app = readFileSync("src/app.js", "utf8");
    expect(app).toContain('url.pathname === "/admin"');
    // Dynamic, so the admin bundle stays off the gameplay path.
    expect(app).toMatch(/import\("\.\/admin\/admin-controller\.js"\)/);
    // And a rejected import must still render something retryable, or a stale
    // deployment leaves /admin blank.
    expect(app).toMatch(/\.catch\(\(\) => \{[\s\S]*Admin could not load\./);
  });
});

describe("renderAdmin", () => {
  it("shows a denial and fetches nothing for a non-staff Explorer", async () => {
    const loadProfile = vi.fn();
    await renderAdmin(root, { clerk: stubClerk("player"), loadProfile });
    expect(loadProfile).not.toHaveBeenCalled();
    expect(root.dataset.adminState).toBe("role");
    expect(root.textContent).toContain("This area is for staff.");
    expect(root.textContent).not.toContain("Admin tools");
  });

  it("renders the shell once the profile confirms the mirrored role", async () => {
    const loadProfile = vi.fn(async () => ({
      access: { role: "admin", permissions: ["audit:read"] }
    }));
    await renderAdmin(root, { clerk: stubClerk("admin"), loadProfile });
    expect(root.dataset.adminState).toBe("allowed");
    expect(root.querySelector("h1")?.textContent).toBe("Admin");
    expect(root.textContent).toContain("admin");
  });

  it("denies a mirror the profile does not back", async () => {
    await renderAdmin(root, {
      clerk: stubClerk("admin"),
      loadProfile: async () => ({ access: { role: "player", permissions: [] } })
    });
    expect(root.dataset.adminState).toBe("profile");
    expect(root.textContent).toContain("does not have an admin role");
  });

  it("says so rather than guessing when the profile is unreachable", async () => {
    await renderAdmin(root, {
      clerk: stubClerk("admin"),
      loadProfile: async () => {
        throw new Error("offline");
      }
    });
    expect(root.dataset.adminState).toBe("unavailable");
    expect(root.textContent).toContain("Admin is unavailable.");
  });

  it("denies rather than throwing when Clerk itself fails to load", async () => {
    const loadProfile = vi.fn();
    await renderAdmin(root, {
      clerk: {
        initialize: async () => {
          throw new Error("clerk blocked");
        },
        mirroredRole: null
      },
      loadProfile
    });
    expect(root.dataset.adminState).toBe("role");
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("builds its Clerk browser with no change callback", async () => {
    // Regression: createClerkBrowser fires onChange on every load, not only on
    // a real auth change, so a reloading callback here looped forever in any
    // environment that had a Clerk key.
    const createClerk = vi.fn(() => stubClerk("player"));
    await renderAdmin(root, { createClerk, loadProfile: vi.fn() });
    expect(createClerk).toHaveBeenCalledTimes(1);
    expect(createClerk).toHaveBeenCalledWith();
  });

  it("escapes the role it echoes back", async () => {
    await renderAdmin(root, {
      clerk: stubClerk("admin"),
      loadProfile: async () => ({
        access: {
          role: "<img src=x onerror=alert(1)>",
          permissions: ["audit:read"]
        }
      })
    });
    expect(root.querySelector("img")).toBeNull();
  });
});

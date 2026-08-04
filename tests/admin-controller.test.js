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
  // SHELL-04's routing pushes real history state (?panel=...); without a
  // reset here, a later test inherits whichever panel an earlier test last
  // navigated to instead of getting its own default.
  window.history.replaceState({}, "", "/admin");
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

describe("SHELL-11 — one shell owns skip-link, header, and main landmark", () => {
  it("is the only place any of the three /admin states build that chrome", () => {
    // Before this, the authorized workbench, the denial/loading frame, and
    // the chunk-load-failure fallback each wrote their own
    // `<a class="skip-link">` + header + `#admin-main`. All three now call
    // through admin-shell.js instead of repeating it.
    const shell = readFileSync("src/admin/admin-shell.js", "utf8");
    expect(shell).toContain('id="admin-main"');
    expect(shell).toContain('tabindex="-1"');

    const view = readFileSync("src/admin/admin-view.js", "utf8");
    expect(view).toContain('from "./admin-shell.js"');
    expect(view).not.toContain("#admin-main");

    const controller = readFileSync("src/admin/admin-controller.js", "utf8");
    expect(controller).toContain('from "./admin-shell.js"');
    expect(controller).not.toContain("#admin-main");

    const app = readFileSync("src/app.js", "utf8");
    expect(app).toMatch(/import\("\.\/admin\/admin-shell\.js"\)/);
    expect(app).not.toContain("#admin-main");
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

  it("renders only the tools a moderator may use", async () => {
    const client = staffClient();
    client.listAdminUsers.mockResolvedValue({
      users: [
        {
          userId: "user_1",
          username: "Nova",
          role: "player",
          membershipState: "none"
        }
      ],
      hasMore: true
    });
    await renderAdmin(root, {
      clerk: stubClerk("moderator"),
      loadProfile: async () => ({
        access: {
          role: "moderator",
          permissions: [
            "audit:read",
            "questions:read",
            "questions:write",
            "users:read"
          ]
        }
      }),
      client
    });
    expect(root.textContent).toContain("Explorer directory");
    expect(root.textContent).toContain("Warden Question bank");
    expect(root.textContent).toContain("Audit trail");
    expect(root.textContent).not.toContain("Operations pulse");
    expect(root.textContent).not.toContain("Membership support");
    expect(root.textContent).not.toContain("Dead deliveries");
    expect(root.textContent).toContain(
      "Additional accounts are not shown in this directory."
    );
    // SHELL-04: only the current panel's dataset fetches, not all five.
    // "Explorer directory" is the first tool a moderator holds permission
    // for, so it is the one selected by default.
    expect(client.listAdminUsers).toHaveBeenCalledTimes(1);
    expect(client.listAdminQuestions).not.toHaveBeenCalled();
    expect(client.listAdminAudit).not.toHaveBeenCalled();
    expect(client.getAdminMetrics).not.toHaveBeenCalled();

    // Switching panels fetches on demand, exactly once, and does not
    // re-fetch the panel already visited.
    root
      .querySelector("[data-panel-link='questions']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(client.listAdminQuestions).toHaveBeenCalledTimes(1);
    });
    expect(client.listAdminUsers).toHaveBeenCalledTimes(1);
    expect(new URL(window.location.href).searchParams.get("panel")).toBe(
      "questions"
    );
  });

  it("renders the complete workbench for an admin", async () => {
    const client = staffClient();
    await renderAdmin(root, {
      clerk: stubClerk("admin"),
      loadProfile: async () => ({
        access: {
          role: "admin",
          permissions: [
            "audit:read",
            "export:any",
            "questions:publish",
            "questions:read",
            "questions:write",
            "refunds:issue",
            "users:read",
            "users:roles:write",
            "webhooks:read"
          ]
        }
      }),
      client
    });
    // "Operations pulse" is first in the tool order, so it is the admin's
    // default panel; the other five are nav-link text, not yet rendered.
    expect(root.textContent).toContain("Operations pulse");
    expect(root.textContent).toContain("Membership support");
    expect(root.textContent).toContain("Dead deliveries");
    expect(client.getAdminMetrics).toHaveBeenCalledTimes(1);
    expect(client.listAdminUsers).not.toHaveBeenCalled();
    expect(client.listAdminQuestions).not.toHaveBeenCalled();

    root
      .querySelector("[data-panel-link='users']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(root.querySelector("[data-action='export-user']")).not.toBeNull();
    });

    root
      .querySelector("[data-panel-link='questions']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(
        root.querySelector("[data-action='publish-question']")
      ).not.toBeNull();
    });

    root
      .querySelector("[data-panel-link='dead']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(client.listDeadWebhooks).toHaveBeenCalledTimes(1);
    });
  });

  it("previews the exact reviewed Echo Lens before publication", async () => {
    const client = staffClient();
    await renderAdmin(root, {
      clerk: stubClerk("moderator"),
      loadProfile: async () => ({
        access: {
          role: "moderator",
          permissions: [
            "audit:read",
            "questions:read",
            "questions:write"
          ]
        }
      }),
      client
    });

    const preview = root.querySelector("[data-echo-lens-preview]");
    expect(preview).toBeInstanceOf(HTMLDetailsElement);
    expect(preview?.textContent).toContain("See two groups");
    expect(preview?.textContent).toContain(
      "Two groups of two make four altogether."
    );
    expect(preview?.textContent).toContain("2 rows by 2 columns");
  });

  it("changes a role through a labelled row control", async () => {
    const client = staffClient();
    await renderAdmin(root, {
      clerk: stubClerk("admin"),
      loadProfile: async () => ({
        access: {
          role: "admin",
          permissions: [
            "audit:read",
            "users:read",
            "users:roles:write"
          ]
        }
      }),
      client
    });
    const select = root.querySelector("[data-role-user='user_1']");
    const button = root.querySelector("[data-save-role='user_1']");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(button).toBeInstanceOf(HTMLButtonElement);
    if (!(select instanceof HTMLSelectElement) || !(button instanceof HTMLButtonElement)) {
      throw new Error("Expected role controls.");
    }
    select.value = "moderator";
    button.click();
    await vi.waitFor(() => {
      expect(client.updateAdminRole).toHaveBeenCalledWith(
        "user_1",
        "moderator"
      );
    });
  });

  it("exports an Explorer through the permission-gated directory action", async () => {
    const client = staffClient();
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:admin-export");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(
        /** @this {HTMLAnchorElement} */
        function clickExport() {
          expect(this.isConnected).toBe(true);
        }
      );
    await renderAdmin(root, {
      clerk: stubClerk("admin"),
      loadProfile: async () => ({
        access: {
          role: "admin",
          permissions: ["audit:read", "export:any", "users:read"]
        }
      }),
      client
    });
    const control = root.querySelector("[data-action='export-user']");
    expect(control).toBeInstanceOf(HTMLButtonElement);
    control?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(client.exportAdminUser).toHaveBeenCalledWith("user_1");
      expect(createObjectUrl).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:admin-export");
    });
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it("keeps a question card visible when deletion fails", async () => {
    const client = staffClient();
    client.deleteAdminQuestion.mockRejectedValue(new Error("Delete failed."));
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: vi.fn(() => true)
    });
    await renderAdmin(root, {
      clerk: stubClerk("admin"),
      loadProfile: async () => ({
        access: {
          role: "admin",
          permissions: [
            "audit:read",
            "questions:publish",
            "questions:read"
          ]
        }
      }),
      client
    });
    const control = root.querySelector("[data-action='delete-question']");
    const card = control?.closest(".admin-record");
    control?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(client.deleteAdminQuestion).toHaveBeenCalledWith("math-1");
    });
    expect(card?.isConnected).toBe(true);
    expect(root.textContent).toContain("Delete failed.");
    Reflect.deleteProperty(window, "confirm");
  });

  it("does not turn a failed membership lookup into a false no-record result", async () => {
    const client = staffClient();
    client.getAdminMembership.mockRejectedValue(
      new Error("Membership lookup unavailable.")
    );
    await renderAdmin(root, {
      clerk: stubClerk("admin"),
      loadProfile: async () => ({
        access: {
          role: "admin",
          permissions: ["audit:read", "refunds:issue"]
        }
      }),
      client
    });
    // "Operations pulse" (also refunds:issue) is first in the tool order and
    // is this admin's default panel; membership support needs navigating to.
    root
      .querySelector("[data-panel-link='membership']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(root.querySelector("[data-form='membership']")).not.toBeNull();
    });
    const form = root.querySelector("[data-form='membership']");
    const input = root.querySelector("[name='membership-user']");
    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (
      !(form instanceof HTMLFormElement) ||
      !(input instanceof HTMLInputElement)
    ) {
      throw new Error("Expected membership lookup form.");
    }
    input.value = "user_1";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(client.getAdminMembership).toHaveBeenCalledWith("user_1");
      expect(root.textContent).toContain("Membership lookup unavailable.");
    });
    expect(root.textContent).not.toContain(
      "No membership record exists for that Explorer."
    );
  });
});

describe("SHELL-15 — the theme choice is reachable from the workbench", () => {
  it("adds an Appearance panel with the three theme choices, and applies a change", async () => {
    localStorage.removeItem("echo-maze:theme");
    const client = staffClient();
    await renderAdmin(root, {
      clerk: stubClerk("admin"),
      loadProfile: async () => ({
        access: { role: "admin", permissions: ["audit:read"] }
      }),
      client
    });
    root
      .querySelector("[data-panel-link='settings']")
      ?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    await vi.waitFor(() => {
      expect(root.querySelector("input[name='admin-theme']")).not.toBeNull();
    });
    const radios = [
      ...root.querySelectorAll("input[name='admin-theme']")
    ].filter(
      /** @returns {radio is HTMLInputElement} */
      (radio) => radio instanceof HTMLInputElement
    );
    expect(radios.map((radio) => radio.value)).toEqual([
      "system",
      "light",
      "dark"
    ]);
    const systemRadio = radios.find((radio) => radio.value === "system");
    expect(systemRadio?.checked).toBe(true);

    const darkRadio = radios.find((radio) => radio.value === "dark");
    darkRadio?.click();
    darkRadio?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(localStorage.getItem("echo-maze:theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("echo-maze:theme");
  });
});

function staffClient() {
  return {
    listAdminUsers: vi.fn(async () => ({
      users: [
        {
          userId: "user_1",
          username: "Nova",
          role: "player",
          membershipState: "none"
        }
      ],
      hasMore: false
    })),
    exportAdminUser: vi.fn(async () => ({ version: 1, data: {} })),
    listAdminQuestions: vi.fn(async () => ({
      questions: [
        {
          id: "math-1",
          levelId: "bright-start",
          difficultyBand: "foundation",
          questionOrdinal: 0,
          versions: [
            {
              version: 1,
              status: "draft",
              content: {
                id: "math-1",
                prompt: "What is 2 + 2?",
                choices: [
                  { id: "a", label: "3" },
                  { id: "b", label: "4" },
                  { id: "c", label: "5" }
                ],
                answerId: "b",
                hint: "Count on.",
                explanation: "Two and two make four.",
                difficultyBand: "foundation",
                difficultyRank: 11,
                topicId: "arithmetic",
                learningObjectiveId: "bright-combine-groups",
                reviewedRevisionId: "database:math-1:v1",
                echoLens: {
                  version: 1,
                  kind: "array",
                  title: "See two groups",
                  reasoning: "Two groups of two make four altogether.",
                  steps: [
                    "Make the first group of two.",
                    "Make the second group of two.",
                    "Count all four."
                  ],
                  visual: {
                    rows: 2,
                    columns: 2,
                    filled: 4
                  }
                }
              }
            }
          ]
        }
      ]
    })),
    listAdminAudit: vi.fn(async () => ({
      events: [
        {
          id: 1,
          actorId: "admin_1",
          actorRole: "admin",
          action: "role.grant",
          resourceType: "user_role",
          resourceId: "user_1",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      nextBefore: null
    })),
    getAdminMetrics: vi.fn(async () => ({
      metrics: {
        explorers: 1,
        dailyActiveExplorers: 1,
        runsStartedToday: 2,
        lifetimeConversions: 0,
        activeMemberships: 0,
        publishedQuestions: 0,
        deadDeliveries: 0
      }
    })),
    listDeadWebhooks: vi.fn(async () => ({ deliveries: [] })),
    updateAdminRole: vi.fn(async (userId, role) => ({ userId, role })),
    getAdminMembership: vi.fn(async () => ({ membership: null })),
    issueAdminRefund: vi.fn(),
    saveAdminQuestion: vi.fn(),
    publishAdminQuestion: vi.fn(),
    deleteAdminQuestion: vi.fn()
  };
}

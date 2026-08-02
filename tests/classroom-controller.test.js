// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderClassroom } from "../src/classroom/classroom-controller.js";

/** @type {HTMLElement} */
let root;

beforeEach(() => {
  document.body.innerHTML = "<div id='class-root'></div>";
  root = /** @type {HTMLElement} */ (document.getElementById("class-root"));
});

function signedOutClerk() {
  return {
    initialize: vi.fn(async () => true),
    getToken: vi.fn(async () => null),
    openSignIn: vi.fn(async () => true),
    openSignUp: vi.fn(async () => true),
    signOut: vi.fn(async () => {}),
    user: null
  };
}

function signedInClerk() {
  return {
    ...signedOutClerk(),
    user: { id: "user_test_1" },
    getToken: vi.fn(async () => "token")
  };
}

function deferred() {
  /** @type {(value: unknown) => void} */
  let resolve = () => {};
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function workspaceClient() {
  return {
    listClassrooms: vi.fn(async () => ({
      /** @type {Record<string, unknown>[]} */
      classrooms: []
    })),
    createClassroom: vi.fn(async () => ({
      classroom: { id: "org_new_1", name: "New Classroom" }
    })),
    getClassroomProgress: vi.fn(async () => ({
      /** @type {Record<string, unknown>[]} */
      progress: [],
      truncated: false
    })),
    getClassroomDomain: vi.fn(async () => ({
      /** @type {string | null} */
      domain: null
    })),
    registerClassroomDomain: vi.fn(async (_classroomId, domain) => ({
      domain
    })),
    inviteClassroomStudent: vi.fn(async () => ({
      invitation: {
        id: "orginv_default",
        emailAddress: "student@example.com",
        status: "pending",
        url: "https://accounts.example.test/invitations/default"
      }
    })),
    listClassExpeditions: vi.fn(async () => ({
      /** @type {Record<string, unknown>[]} */
      expeditions: []
    })),
    listClassExpeditionGrants: vi.fn(async () => ({
      /** @type {Record<string, unknown>[]} */
      grants: []
    })),
    getClassExpeditionProgress: vi.fn(async () => ({
      progress: {
        startedStudentCount: 0,
        regionCompleteCount: 0,
        /** @type {Record<string, unknown>[]} */
        labyrinths: []
      }
    })),
    createClassExpedition: vi.fn(async (_classroomId, input) => ({
      expedition: {
        id: "exped_created_1",
        status: "open",
        ...input
      }
    })),
    setClassExpeditionStatus: vi.fn(async (_classroomId, id, status) => ({
      expedition: { id, status }
    })),
    getClassExpeditionCapacity: vi.fn(async () => ({
      capacity: {
        seatsTotal: 30,
        seatsAssigned: 0,
        baseStatus: null,
        extensionPaidCount: 0,
        baseRefundEligible: true,
        extensionRefundEligibleCount: 0
      }
    })),
    purchaseClassExpeditionLicense: vi.fn(async () => ({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_ui_1",
      purchaseId: "9d2f8a34-0000-4000-8000-000000000002"
    }))
  };
}

describe("Classroom workspace", () => {
  it("is a reload-safe lazy SPA route", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        { source: "/class", destination: "/index.html" }
      ])
    );
    const app = readFileSync("src/app.js", "utf8");
    expect(app).toContain('url.pathname === "/class"');
    expect(app).toMatch(
      /import\("\.\/classroom\/classroom-controller\.js"\)/
    );
  });

  it("shows a clear signed-out state without reading Classroom data", async () => {
    const clerk = signedOutClerk();
    const client = workspaceClient();
    await renderClassroom(root, { clerk, client });

    expect(root.dataset.classroomState).toBe("signed-out");
    expect(root.textContent).toContain("Sign in to open your Classroom");
    expect(client.listClassrooms).not.toHaveBeenCalled();

    const signIn = root.querySelector("[data-action='sign-in']");
    signIn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(clerk.openSignIn).toHaveBeenCalled());
  });

  it("lets a Student choose Class Play or Personal Play", async () => {
    const client = workspaceClient();
    client.listClassrooms.mockResolvedValue({
      classrooms: [
        { id: "org_class_1", name: "Comet Crew", role: "student" }
      ]
    });
    const navigate = vi.fn();
    const storage = new MapStorage();
    await renderClassroom(root, {
      clerk: signedInClerk(),
      client,
      navigate,
      storage
    });

    expect(root.dataset.classroomState).toBe("ready");
    expect(root.textContent).toContain("Comet Crew");
    expect(root.textContent).toContain("Student");

    root
      .querySelector("[data-class-play='org_class_1']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(storage.getItem(
      "echo-maze:selected-classroom:v1:user_test_1"
    )).toBe(
      "org_class_1"
    );
    expect(navigate).toHaveBeenCalledWith("/play");

    root
      .querySelector("[data-action='personal-play']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(storage.getItem(
      "echo-maze:selected-classroom:v1:user_test_1"
    )).toBeNull();
  });

  it("falls back to Personal Play when the selected Membership disappears", async () => {
    const client = workspaceClient();
    client.listClassrooms.mockResolvedValue({
      classrooms: [
        { id: "org_other_1", name: "Aurora Crew", role: "student" }
      ]
    });
    const storage = new MapStorage();
    storage.setItem(
      "echo-maze:selected-classroom:v1:user_test_1",
      "org_removed_1"
    );

    await renderClassroom(root, {
      clerk: signedInClerk(),
      client,
      storage
    });

    expect(storage.getItem(
      "echo-maze:selected-classroom:v1:user_test_1"
    )).toBeNull();
    expect(root.dataset.classroomSelectionFallback).toBe("true");
    expect(root.textContent).toContain(
      "selected Classroom Membership is no longer available"
    );
    expect(root.textContent).toContain("Personal Play is active");
  });

  it("gives Teachers invitation and minimized progress tools", async () => {
    const client = workspaceClient();
    client.listClassrooms.mockResolvedValue({
      classrooms: [
        { id: "org_class_1", name: "Comet Crew", role: "teacher" }
      ]
    });
    client.getClassroomProgress.mockResolvedValue({
      progress: [
        {
          studentId: "user_student_1",
          objectiveId: "bright-combine-groups",
          correct: 3,
          wrong: 1,
          hints: 0,
          skips: 0,
          total: 4
        }
      ],
      truncated: false
    });
    client.inviteClassroomStudent.mockResolvedValue({
      invitation: {
        id: "orginv_1",
        emailAddress: "student@example.com",
        status: "pending",
        url: "https://accounts.example.test/invitations/orginv_1"
      }
    });
    const clipboard = { writeText: vi.fn(async () => {}) };
    await renderClassroom(root, {
      clerk: signedInClerk(),
      client,
      clipboard
    });

    await vi.waitFor(() => {
      expect(root.textContent).toContain("bright combine groups");
      expect(root.textContent).toContain("3 correct");
    });
    expect(root.textContent).not.toContain("What is 2 + 2?");

    const teacherPanel = root.querySelector(
      "[data-teacher-classroom='org_class_1']"
    );
    const email = teacherPanel?.querySelector("input[name='email']");
    const form = teacherPanel?.querySelector("[data-classroom-invite]");
    expect(email).toBeInstanceOf(HTMLInputElement);
    if (email instanceof HTMLInputElement) {
      email.value = "student@example.com";
    }
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(client.inviteClassroomStudent).toHaveBeenCalledWith(
        "org_class_1",
        "student@example.com"
      )
    );
    root
      .querySelector("[data-action='copy-invitation']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(clipboard.writeText).toHaveBeenCalledWith(
        "https://accounts.example.test/invitations/orginv_1"
      )
    );
  });

  it("lets a Teacher register the verified domain used for automatic joins", async () => {
    const client = workspaceClient();
    client.listClassrooms.mockResolvedValue({
      classrooms: [
        { id: "org_class_1", name: "Comet Crew", role: "teacher" }
      ]
    });
    client.getClassroomDomain.mockResolvedValue({
      domain: "students.school.example"
    });
    await renderClassroom(root, { clerk: signedInClerk(), client });

    await vi.waitFor(() => {
      expect(client.getClassroomDomain).toHaveBeenCalledWith("org_class_1");
      expect(root.textContent).toContain("students.school.example");
    });

    const panel = root.querySelector(
      "[data-teacher-classroom='org_class_1']"
    );
    const input = panel?.querySelector("input[name='domain']");
    const form = panel?.querySelector("[data-classroom-domain]");
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (input instanceof HTMLInputElement) {
      input.value = "learn.school.example";
    }
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() =>
      expect(client.registerClassroomDomain).toHaveBeenCalledWith(
        "org_class_1",
        "learn.school.example"
      )
    );
    expect(root.textContent).toContain(
      "learn.school.example is ready for verified student accounts"
    );
  });

  it("lets a Teacher assign, close, and reopen a Class Expedition", async () => {
    const client = workspaceClient();
    client.listClassrooms.mockResolvedValue({
      classrooms: [
        { id: "org_class_1", name: "Comet Crew", role: "teacher" }
      ]
    });
    client.listClassExpeditions.mockResolvedValue({
      expeditions: [
        {
          id: "exped_live_1",
          classroomId: "org_class_1",
          atlasRegion: 2,
          levelId: "trail-scout",
          learningDeckId: "number-trail",
          learningDeckRevision:
            "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105",
          status: "open",
          completionDate: "2026-09-15"
        }
      ]
    });
    await renderClassroom(root, { clerk: signedInClerk(), client });

    await vi.waitFor(() => {
      expect(client.listClassExpeditions).toHaveBeenCalledWith("org_class_1");
      expect(root.textContent).toContain("Region 2");
      expect(root.textContent).toContain("Number Trail");
      expect(root.textContent).toContain("2026-09-15");
    });

    const panel = root.querySelector(
      "[data-teacher-classroom='org_class_1']"
    );
    const deckSelect = panel?.querySelector("select[name='learningDeckId']");
    expect(deckSelect).toBeInstanceOf(HTMLSelectElement);
    if (deckSelect instanceof HTMLSelectElement) {
      expect(
        [...deckSelect.options].map((option) => option.value)
      ).toEqual(["mixed-trail", "number-trail"]);
    }

    const regionSelect = panel?.querySelector("select[name='atlasRegion']");
    if (regionSelect instanceof HTMLSelectElement) {
      regionSelect.value = "3";
    }
    const levelSelect = panel?.querySelector("select[name='levelId']");
    if (levelSelect instanceof HTMLSelectElement) {
      levelSelect.value = "maze-master";
    }
    const form = panel?.querySelector("[data-classroom-expedition]");
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(client.createClassExpedition).toHaveBeenCalledWith(
        "org_class_1",
        expect.objectContaining({
          atlasRegion: 3,
          levelId: "maze-master",
          learningDeckId: "mixed-trail",
          learningDeckRevision:
            "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92",
          completionDate: null
        })
      )
    );

    const toggle = panel?.querySelector("[data-action='toggle-expedition']");
    toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(client.setClassExpeditionStatus).toHaveBeenCalledWith(
        "org_class_1",
        "exped_live_1",
        "closed"
      )
    );

    // The reopen branch is the other half of this case's title, and asserting
    // only the close transition left it free to regress silently.
    client.setClassExpeditionStatus.mockClear();
    client.listClassExpeditions.mockResolvedValue({
      expeditions: [
        {
          id: "exped_live_1",
          classroomId: "org_class_1",
          atlasRegion: 2,
          levelId: "trail-scout",
          learningDeckId: "number-trail",
          learningDeckRevision:
            "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105",
          status: "closed",
          completionDate: null
        }
      ]
    });
    root.replaceChildren();
    await renderClassroom(root, { clerk: signedInClerk(), client });
    const closedPanel = await vi.waitUntil(() =>
      root.querySelector(".classroom-expeditions")
    );
    const reopen = closedPanel?.querySelector(
      "[data-action='toggle-expedition']"
    );
    reopen?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(client.setClassExpeditionStatus).toHaveBeenCalledWith(
        "org_class_1",
        "exped_live_1",
        "open"
      )
    );
  });

  it("shows aggregate-only Expedition progress to Teachers", async () => {
    const client = workspaceClient();
    client.listClassrooms.mockResolvedValue({
      classrooms: [
        { id: "org_class_1", name: "Comet Crew", role: "teacher" }
      ]
    });
    client.listClassExpeditions.mockResolvedValue({
      expeditions: [
        {
          id: "exped_live_1",
          classroomId: "org_class_1",
          atlasRegion: 1,
          levelId: "bright-start",
          learningDeckId: "mixed-trail",
          learningDeckRevision:
            "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92",
          status: "open",
          completionDate: null
        }
      ]
    });
    client.getClassExpeditionProgress.mockResolvedValue({
      progress: {
        startedStudentCount: 5,
        regionCompleteCount: 2,
        labyrinths: [
          { labyrinthNumber: 1, completedCount: 5 },
          { labyrinthNumber: 2, completedCount: 4 },
          { labyrinthNumber: 3, completedCount: 3 },
          { labyrinthNumber: 4, completedCount: 2 }
        ],
        // Identity the aggregate-only contract forbids rendering. It is served
        // here deliberately: without a name in the payload the assertion below
        // could never fail, and the privacy guarantee would go untested. The
        // cast is the point — the contract has no such field, and the card
        // must still not render one that arrives anyway.
        .../** @type {Record<string, unknown>} */ ({
          studentName: "Moss",
          students: [{ username: "Moss", labyrinthNumber: 4 }]
        })
      }
    });
    await renderClassroom(root, { clerk: signedInClerk(), client });

    await vi.waitFor(() => {
      expect(client.getClassExpeditionProgress).toHaveBeenCalledWith(
        "org_class_1",
        "exped_live_1"
      );
      expect(root.textContent).toContain("5 started");
      expect(root.textContent).toContain("2 finished the Region");
      expect(root.textContent).toContain("L4: 2");
    });
    expect(root.textContent).not.toContain("Moss");
  });

  it("offers the sponsor test-mode License purchase until the License is paid", async () => {
    const client = workspaceClient();
    const navigate = vi.fn();
    client.listClassrooms.mockResolvedValue({
      classrooms: [
        { id: "org_class_1", name: "Comet Crew", role: "teacher" }
      ]
    });
    client.listClassExpeditions.mockResolvedValue({
      expeditions: [
        {
          id: "exped_live_1",
          classroomId: "org_class_1",
          atlasRegion: 1,
          levelId: "bright-start",
          learningDeckId: "mixed-trail",
          learningDeckRevision:
            "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92",
          status: "open",
          completionDate: null
        }
      ]
    });
    await renderClassroom(root, { clerk: signedInClerk(), client, navigate });

    await vi.waitFor(() => {
      expect(client.getClassExpeditionCapacity).toHaveBeenCalledWith(
        "org_class_1",
        "exped_live_1"
      );
      expect(root.textContent).toContain("No paid License yet");
    });

    const buy = root.querySelector("[data-action='buy-expedition-license']");
    expect(buy).toBeInstanceOf(HTMLButtonElement);
    expect(buy?.textContent).toContain("Stripe test mode");
    buy?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(client.purchaseClassExpeditionLicense).toHaveBeenCalledWith(
        "org_class_1",
        "exped_live_1",
        "base"
      );
      expect(navigate).toHaveBeenCalledWith(
        "https://checkout.stripe.com/c/pay/cs_test_ui_1"
      );
    });
  });

  it("renders tools and progress for every Teacher Classroom", async () => {
    const client = workspaceClient();
    client.listClassrooms.mockResolvedValue({
      classrooms: [
        { id: "org_class_1", name: "Comet Crew", role: "teacher" },
        { id: "org_class_2", name: "Aurora Crew", role: "teacher" }
      ]
    });
    client.getClassroomProgress.mockResolvedValue({
      progress: [{
        objectiveId: "bright-combine-groups",
        correct: 1,
        wrong: 0,
        hints: 0,
        skips: 0,
        total: 1
      }],
      truncated: true
    });
    await renderClassroom(root, { clerk: signedInClerk(), client });

    await vi.waitFor(() => {
      expect(
        root.querySelectorAll("[data-teacher-classroom]")
      ).toHaveLength(2);
      expect(client.getClassroomProgress).toHaveBeenCalledWith("org_class_1");
      expect(client.getClassroomProgress).toHaveBeenCalledWith("org_class_2");
    });
    expect(root.textContent).toContain("first 100");
    expect(
      root.querySelectorAll("input[name='email']")
    ).toHaveLength(2);
  });

  it("does not let an older progress request overwrite fresh counts", async () => {
    const first = deferred();
    const second = deferred();
    const client = workspaceClient();
    client.listClassrooms.mockResolvedValue({
      classrooms: [
        { id: "org_class_1", name: "Comet Crew", role: "teacher" }
      ]
    });
    client.getClassroomProgress
      .mockImplementationOnce(
        async () => /** @type {any} */ (first.promise)
      )
      .mockImplementationOnce(
        async () => /** @type {any} */ (second.promise)
      );
    await renderClassroom(root, { clerk: signedInClerk(), client });

    root
      .querySelector("[data-action='refresh-progress']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(client.getClassroomProgress).toHaveBeenCalledTimes(2);
    });
    second.resolve({
      progress: [{
        objectiveId: "bright-combine-groups",
        correct: 4,
        wrong: 0,
        hints: 0,
        skips: 0,
        total: 4
      }],
      truncated: false
    });
    await vi.waitFor(() => {
      expect(root.textContent).toContain("4 correct");
    });

    first.resolve({
      progress: [{
        objectiveId: "bright-combine-groups",
        correct: 1,
        wrong: 0,
        hints: 0,
        skips: 0,
        total: 1
      }],
      truncated: false
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(root.textContent).toContain("4 correct");
  });

  it("keeps the email fallback when clipboard access is unavailable", async () => {
    const client = workspaceClient();
    client.listClassrooms.mockResolvedValue({
      classrooms: [
        { id: "org_class_1", name: "Comet Crew", role: "teacher" }
      ]
    });
    await renderClassroom(root, {
      clerk: signedInClerk(),
      client,
      clipboard: undefined
    });

    const email = root.querySelector("input[name='email']");
    if (email instanceof HTMLInputElement) {
      email.value = "student@example.com";
    }
    root
      .querySelector("[data-classroom-invite]")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(
        root.querySelector("[data-action='copy-invitation']")
      ).toBeNull();
      expect(
        root.querySelector("a[href^='mailto:student%40example.com']")
      ).toBeInstanceOf(HTMLAnchorElement);
    });
  });

  it("does not render a completed Classroom request after sign-out", async () => {
    const pending = deferred();
    const client = workspaceClient();
    client.listClassrooms.mockImplementationOnce(
      async () => /** @type {any} */ (pending.promise)
    );
    const clerk = signedInClerk();
    clerk.signOut = vi.fn(async () => {
      /** @type {any} */ (clerk).user = null;
    });

    const rendering = renderClassroom(root, { clerk, client });
    await vi.waitFor(() => expect(client.listClassrooms).toHaveBeenCalled());
    root
      .querySelector("[data-action='sign-out']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(root.dataset.classroomState).toBe("signed-out");
    });

    pending.resolve({
      classrooms: [
        { id: "org_old_1", name: "Old Account Class", role: "student" }
      ]
    });
    await rendering;
    expect(root.dataset.classroomState).toBe("signed-out");
    expect(root.textContent).not.toContain("Old Account Class");
  });

  it("does not reuse another account's cached Classroom view", async () => {
    const client = workspaceClient();
    client.listClassrooms
      .mockResolvedValueOnce({
        classrooms: [
          { id: "org_first_1", name: "First Account Class", role: "student" }
        ]
      })
      .mockRejectedValueOnce(new Error("offline"));
    const clerk = signedInClerk();
    await renderClassroom(root, { clerk, client });
    clerk.user = { id: "user_test_2" };

    root
      .querySelector("[data-action='refresh']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(root.dataset.classroomState).toBe("error");
    });
    expect(root.textContent).not.toContain("First Account Class");
  });

  it("keeps the last safe view and labels it stale after a refresh failure", async () => {
    const client = workspaceClient();
    client.listClassrooms
      .mockResolvedValueOnce({
        classrooms: [
          { id: "org_class_1", name: "Comet Crew", role: "student" }
        ]
      })
      .mockRejectedValueOnce(new Error("offline"));
    await renderClassroom(root, { clerk: signedInClerk(), client });

    root
      .querySelector("[data-action='refresh']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(root.dataset.classroomState).toBe("stale");
    });
    expect(root.textContent).toContain("Comet Crew");
    expect(root.textContent).toContain("Showing the last loaded view");
  });
});

class MapStorage {
  /** @type {Map<string, string>} */
  values = new Map();
  /** @param {string} key */
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  /** @param {string} key @param {string} value */
  setItem(key, value) {
    this.values.set(key, value);
  }
  /** @param {string} key */
  removeItem(key) {
    this.values.delete(key);
  }
}

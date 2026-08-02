import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";

const classroomAsset = readdirSync("dist/assets").find((name) =>
  /^classroom-controller-.*\.js$/.test(name)
);

if (!classroomAsset) {
  throw new Error("Built Classroom controller asset was not found.");
}

test("keeps the Classroom entry clear at desktop/mobile, keyboard, reduced motion, and 200 percent text", async ({
  page
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/class");

  const app = page.locator("#game-root");
  await expect(app).toHaveAttribute(
    "data-classroom-state",
    /signed-out|unavailable/,
    { timeout: 15_000 }
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Choose where this Quest belongs."
    })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Personal Play" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to Classroom" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#classroom-main")).toBeFocused();

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Choose where this Quest belongs."
    })
  ).toBeVisible();
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);

  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`classroom-${testInfo.project.name}.png`)
  });
});

test("renders the Classroom browser state matrix and Teacher workflows", async ({
  page
}) => {
  await page.goto("/");

  await renderMockWorkspace(page, "student");
  await expect(page.getByText("Comet Crew")).toBeVisible();
  await expect(page.getByText("Student", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Class Play" })).toBeVisible();

  await renderMockWorkspace(page, "empty");
  await expect(page.getByText("No Membership yet")).toBeVisible();

  await renderMockWorkspace(page, "teacher");
  await expect(page.getByText("Teacher tools")).toBeVisible();
  await expect(page.getByText("Try next: Combine groups")).toBeVisible();
  await expect(page.getByText("3 correct")).toBeVisible();
  await expect(page.locator("#game-root")).not.toContainText("Moss");
  await expect(page.locator("#game-root")).not.toContainText("user_student_1");

  await expect(
    page.getByRole("heading", { name: "Verified school domain" })
  ).toBeVisible();
  await page.getByLabel("School email domain").fill("learn.school.example");
  await page.getByRole("button", { name: "Save domain" }).click();
  await expect(page.getByText(
    "learn.school.example is ready for verified student accounts."
  )).toBeVisible();

  await page.getByLabel("Classroom name").fill("Aurora Crew");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(/Aurora Crew was created/)).toBeVisible();

  await page.getByLabel("Student email").fill("student@example.com");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(
    page.getByText("Invitation sent to student@example.com.")
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open email draft" })).toBeVisible();

  await renderMockWorkspace(page, "loading", false);
  await expect(page.locator("#game-root")).toHaveAttribute(
    "data-classroom-state",
    "loading"
  );
  await expect(page.getByText(
    "Loading synchronized Classroom Memberships"
  )).toBeVisible();
  await expect(page.locator(".classroom-loading")).toHaveCount(1);

  await renderMockWorkspace(page, "error");
  await expect(page.getByRole("alert")).toContainText(
    "Your Classroom view is unavailable"
  );

  await renderMockWorkspace(page, "stale");
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.locator("#game-root")).toHaveAttribute(
    "data-classroom-state",
    "stale"
  );
  await expect(page.getByText("Showing the last loaded view", {
    exact: false
  })).toBeVisible();
  await expect(page.getByText("Comet Crew")).toBeVisible();
});

/**
 * @param {import("@playwright/test").Page} page
 * @param {"student" | "empty" | "teacher" | "loading" | "error" | "stale"} scenario
 * @param {boolean} [waitForRender]
 */
async function renderMockWorkspace(page, scenario, waitForRender = true) {
  const options = {
    asset: classroomAsset,
    scenario,
    waitForRender
  };
  await page.evaluate(
    async ({ asset, scenario, waitForRender }) => {
      localStorage.clear();
      const { renderClassroom } = await import(`/assets/${asset}`);
      let root = document.getElementById("game-root");
      if (!(root instanceof HTMLElement)) {
        throw new Error("Game root unavailable.");
      }
      if (root.dataset.classroomMockRoot !== "true") {
        const replacement = document.createElement("div");
        replacement.id = "game-root";
        replacement.dataset.classroomMockRoot = "true";
        root.replaceWith(replacement);
        root = replacement;
      }
      const clerk = {
        initialize: async () => true,
        getToken: async () => "test-token",
        user: { id: "user_teacher_1" },
        openSignIn: async () => true,
        openSignUp: async () => true,
        signOut: async () => {}
      };
      let listCalls = 0;
      const classrooms =
        scenario === "teacher"
          ? [{ id: "org_class_1", name: "Comet Crew", role: "teacher" }]
          : scenario === "student" || scenario === "stale"
            ? [{ id: "org_class_1", name: "Comet Crew", role: "student" }]
            : [];
      const client = {
        listClassrooms: async () => {
          listCalls += 1;
          if (scenario === "loading") {
            return await new Promise(() => {});
          }
          if (scenario === "error" || (scenario === "stale" && listCalls > 1)) {
            throw new Error("offline");
          }
          return { classrooms };
        },
        /** @param {string} name */
        createClassroom: async (name) => ({
          classroom: { id: "org_new_1", name }
        }),
        getClassroomProgress: async () => ({
          progress: [{
            objectiveId: "bright-combine-groups",
            correct: 3,
            wrong: 1,
            hints: 0,
            skips: 0,
            total: 4
          }],
          truncated: false
        }),
        getClassroomDomain: async () => ({ domain: null }),
        /** @param {string} _classroomId @param {string} domain */
        registerClassroomDomain: async (_classroomId, domain) => ({ domain }),
        /** @param {string} _classroomId @param {string} emailAddress */
        inviteClassroomStudent: async (_classroomId, emailAddress) => ({
          invitation: {
            id: "orginv_1",
            emailAddress,
            status: "pending",
            url: "https://accounts.example.test/invitations/orginv_1"
          }
        }),
        listClassExpeditions: async () => ({
          expeditions: [{
            id: "exped_e2e_1",
            classroomId: "org_class_1",
            atlasRegion: 2,
            levelId: "trail-scout",
            learningDeckId: "number-trail",
            learningDeckRevision:
              "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105",
            status: "open",
            completionDate: "2026-09-15"
          }]
        }),
        listClassExpeditionGrants: async () => ({
          grants: [
            { labyrinthNumber: 5, runId: "class_run_e2e_0001", status: "escaped" }
          ]
        }),
        getClassExpeditionProgress: async () => ({
          progress: {
            startedStudentCount: 6,
            regionCompleteCount: 1,
            labyrinths: [
              { labyrinthNumber: 5, completedCount: 6 },
              { labyrinthNumber: 6, completedCount: 4 },
              { labyrinthNumber: 7, completedCount: 2 },
              { labyrinthNumber: 8, completedCount: 1 }
            ],
            // Served on purpose so the aggregate-only assertion below has an
            // identity it could fail on.
            studentName: "Moss",
            students: [{ username: "Moss", labyrinthNumber: 8 }]
          }
        }),
        getClassExpeditionConstellation: async () => ({
          constellation: {
            published: true,
            markers: [
              { labyrinthNumber: 5, band: "quiet" },
              { labyrinthNumber: 6, band: "glowing" },
              { labyrinthNumber: 8, band: "bright" }
            ]
          }
        }),
        getClassExpeditionCapacity: async () => ({
          capacity: {
            seatsTotal: 30,
            seatsAssigned: 6,
            baseStatus: "paid",
            extensionPaidCount: 0,
            baseRefundEligible: false,
            extensionRefundEligibleCount: 0
          }
        }),
        /** @param {string} _classroomId @param {string} expeditionId @param {string} kind */
        purchaseClassExpeditionLicense: async (
          _classroomId,
          expeditionId,
          kind
        ) => ({
          checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_e2e_1",
          purchaseId: `purchase_${expeditionId}_${kind}`
        }),
        /** @param {string} _classroomId @param {string} expeditionId @param {string} status */
        setClassExpeditionStatus: async (_classroomId, expeditionId, status) => ({
          expedition: { id: expeditionId, status }
        })
      };
      const rendering = renderClassroom(root, {
        clerk,
        client,
        clipboard: {},
        navigate: () => {}
      });
      if (waitForRender) {
        await rendering;
      }
    },
    options
  );
}


test("shows Class Expedition tools to Teachers and Students with counts only", async ({
  page
}, testInfo) => {
  await page.goto("/class");
  await renderMockWorkspace(page, "teacher");
  const teacherPanel = page.locator("[data-teacher-classroom='org_class_1']");
  await expect(teacherPanel.locator(".classroom-expeditions")).toBeVisible();
  await expect(teacherPanel).toContainText("Region 2");
  await expect(teacherPanel).toContainText("6 started");
  await expect(teacherPanel).toContainText("1 finished the Region");
  await expect(teacherPanel).toContainText("6 of 30 seats assigned");
  const constellation = teacherPanel.locator(
    "[data-class-constellation='true']"
  );
  await expect(constellation).toContainText("Density bands only");
  await expect(
    constellation.locator(".classroom-constellation-marker")
  ).toHaveCount(3);
  await expect(constellation).not.toContainText(/count|student|route/i);
  // Scoped to the Expedition list and matching the name the progress fixture
  // actually serves, so this fails if a Student's identity ever renders.
  await expect(
    teacherPanel.locator(".classroom-expeditions")
  ).not.toContainText("Moss");
  await expect(
    teacherPanel.locator("select[name='learningDeckId'] option")
  ).toHaveCount(2);
  {
    const body = await page.screenshot({ fullPage: true });
    await testInfo.attach(
      `teacher-expeditions-${testInfo.project.name}`,
      { body, contentType: "image/png" }
    );
    if (process.env.RECORD_MILESTONE_4_SCREENSHOTS === "true") {
      const { writeFile } = await import("node:fs/promises");
      const { resolve } = await import("node:path");
      await writeFile(
        resolve(
          "docs",
          "playtests",
          "screenshots",
          `milestone-4-teacher-expeditions-${testInfo.project.name}.png`
        ),
        body
      );
    }
  }

  await renderMockWorkspace(page, "student");
  const studentCard = page.locator(".classroom-card", {
    hasText: "Comet Crew"
  });
  await expect(
    studentCard.locator("[data-student-expedition='exped_e2e_1']")
  ).toBeVisible();
  await expect(studentCard).toContainText("1 of 4 Labyrinths escaped");
  await expect(studentCard.locator("[data-private-reflection='true']")).toContainText(
    "These prompts stay on this device"
  );
  const browserState = await page.evaluate(() => {
    /** @param {unknown} value @returns {unknown} */
    function walk(value) {
      if (value === null || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map(walk);
      const objectValue = /** @type {Record<string, unknown>} */ (value);
      return Object.fromEntries(
        Object.entries(objectValue).map(([key, nested]) => [key, walk(nested)])
      );
    }
    return JSON.stringify(
      walk(Object.fromEntries(Object.entries(localStorage)))
    );
  });
  expect(browserState).not.toMatch(
    /studentName|username|answer|prompt|timestamp|route|rank|diagnos/i
  );
  const startButton = studentCard.locator(
    "[data-action='start-class-expedition']"
  );
  await expect(startButton).toHaveText("Continue Class Expedition");
  {
    const body = await page.screenshot({ fullPage: true });
    await testInfo.attach(
      `student-expeditions-${testInfo.project.name}`,
      { body, contentType: "image/png" }
    );
    if (process.env.RECORD_MILESTONE_4_SCREENSHOTS === "true") {
      const { writeFile } = await import("node:fs/promises");
      const { resolve } = await import("node:path");
      await writeFile(
        resolve(
          "docs",
          "playtests",
          "screenshots",
          `milestone-4-student-expeditions-${testInfo.project.name}.png`
        ),
        body
      );
    }
  }
});

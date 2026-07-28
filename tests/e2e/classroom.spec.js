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
  await expect(page.getByText("Moss")).toBeVisible();
  await expect(page.getByText("3 correct")).toBeVisible();
  await expect(page.locator("#game-root")).not.toContainText("user_student_1");

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
            studentName: "Moss",
            objectiveId: "addition-within-20",
            correct: 3,
            wrong: 1,
            hints: 0,
            skips: 0,
            total: 4
          }],
          truncated: false
        }),
        /** @param {string} _classroomId @param {string} emailAddress */
        inviteClassroomStudent: async (_classroomId, emailAddress) => ({
          invitation: {
            id: "orginv_1",
            emailAddress,
            status: "pending",
            url: "https://accounts.example.test/invitations/orginv_1"
          }
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

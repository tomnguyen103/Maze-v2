import { expect, test } from "@playwright/test";
import { loadEnv } from "vite";

const hasClerkPublishableKey = Boolean(
  loadEnv("production", process.cwd(), "VITE_CLERK_").VITE_CLERK_PUBLISHABLE_KEY
);

test("keeps root as a non-running Echo Maze introduction", async ({ page }) => {
  /** @type {string[]} */
  const gameEntrypointRequests = [];
  page.on("request", (request) => {
    if (/^\/(?:assets\/main-[^/]+\.js|src\/main\.js)$/.test(new URL(request.url()).pathname)) {
      gameEntrypointRequests.push(request.url());
    }
  });

  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Echo Maze" })
  ).toBeVisible();
  await expect(page.locator("#maze-canvas")).toHaveCount(0);
  expect(gameEntrypointRequests).toEqual([]);
});

test("keeps guest entry available beside sign in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Sign in", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter the Maze" })).toBeEnabled();
});

test("opens the maintained Clerk SignIn dialog when configured", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One configured browser check is sufficient.");
  test.skip(!hasClerkPublishableKey, "Clerk is not configured for this browser run.");
  await page.goto("/");
  const signIn = page.getByRole("button", { name: "Sign in", exact: true }).first();

  await expect(signIn).toBeEnabled();
  await signIn.click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel(/Email address/i)).toBeVisible();
});

test("starts normal gameplay at a clean play route", async ({ page }) => {
  await page.goto("/play");

  await expect(page.getByLabel(/Interactive maze/)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/play");
  expect(new URL(page.url()).search).toBe("");
});

test("blocks a completed guest demo on return, reload, and direct links", async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "echo-maze:demo-access:v1",
      JSON.stringify({ version: 1, completed: true })
    );
  });

  await page.goto("/play");

  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("echo-maze:demo-access:v1"))
    )
    .toBe(JSON.stringify({ version: 1, completed: true }));
  await expect(
    page.getByRole("dialog", { name: "Create an account for three free Runs." })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account for three Runs" })
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Choose your Quest Level" })
  ).not.toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Create an account for three free Runs." })
  ).toBeVisible();

  await page.goto("/play?seed=DEMO-GATE&level=trail-scout&labyrinth=2");
  await expect(
    page.getByRole("dialog", { name: "Create an account for three free Runs." })
  ).toBeVisible();
});

test("hands the top layer from the demo gate to Clerk account creation", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One configured browser check is sufficient.");
  test.skip(!hasClerkPublishableKey, "Clerk is not configured for this browser run.");
  await page.addInitScript(() => {
    localStorage.setItem(
      "echo-maze:demo-access:v1",
      JSON.stringify({ version: 1, completed: true })
    );
  });

  await page.goto("/play");

  const demoGate = page.getByRole("dialog", {
    name: "Create an account for three free Runs."
  });
  await expect(demoGate).toBeVisible();
  await page
    .getByRole("button", { name: "Create account for three Runs" })
    .click();

  await expect(demoGate).not.toBeVisible();
  await expect(page.getByLabel(/Email address/i)).toBeVisible();
});

test("shows a recovery action when gameplay code cannot load", async ({ page }) => {
  await page.route(
    /\/(?:src\/main\.js|assets\/main-[^/]+\.js)(?:\?.*)?$/,
    (route) => route.abort()
  );

  await page.goto("/play?seed=RETRY-KEEP&level=trail-scout&labyrinth=3");

  await expect(
    page.getByRole("heading", { name: "Echo Maze could not load." })
  ).toBeVisible();
  const retryLink = page.getByRole("link", { name: "Try again" });
  await expect(retryLink).toBeVisible();
  const retryUrl = new URL(
    (await retryLink.getAttribute("href")) ?? "",
    page.url()
  );
  expect(retryUrl.pathname).toBe("/play");
  expect(retryUrl.searchParams.get("seed")).toBe("RETRY-KEEP");
  expect(retryUrl.searchParams.get("level")).toBe("trail-scout");
  expect(retryUrl.searchParams.get("labyrinth")).toBe("3");
});

test("copies an explicit share link without changing normal gameplay URL", async ({
  page
}) => {
  await page.goto("/play");
  await page.getByRole("button", { name: /Trail Scout/ }).click();
  await expect(page.locator("#seed-value")).not.toHaveText("");
  const seed = await page.locator("#seed-value").textContent();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (/** @type {string} */ value) => {
          Reflect.set(window, "__copiedShareLink", value);
        }
      }
    });
  });

  await page.getByRole("button", { name: /Copy share link/i }).click();

  expect(new URL(page.url()).pathname).toBe("/play");
  expect(new URL(page.url()).search).toBe("");
  const shareLink = new URL(
    await page.evaluate(() => Reflect.get(window, "__copiedShareLink"))
  );
  expect(shareLink.pathname).toBe("/play");
  expect(shareLink.searchParams.get("seed")).toBe(seed);
  expect(shareLink.searchParams.get("level")).toBe("trail-scout");
  expect(shareLink.searchParams.get("labyrinth")).toBe("1");

  await page.goto(`${shareLink.pathname}${shareLink.search}`);
  await expect(page.locator("#seed-value")).toHaveText(seed ?? "");
  const firstAccessRunId = await page.evaluate(() => {
    const locator = JSON.parse(
      localStorage.getItem("echo-maze:active-run:v1") ?? "null"
    );
    return locator?.runId;
  });
  expect(firstAccessRunId).toMatch(/^access_[A-Za-z0-9_-]+$/);
  await page.reload();
  const reloadedAccessRunId = await page.evaluate(() => {
    const locator = JSON.parse(
      localStorage.getItem("echo-maze:active-run:v1") ?? "null"
    );
    return locator?.runId;
  });
  expect(reloadedAccessRunId).toBe(firstAccessRunId);
  await expect(page.locator("#quest-stage")).toHaveText(
    /Labyrinth 1 of 20.*Foundation/
  );
});

test("restarts the same active Labyrinth after a clean play-route refresh", async ({
  page
}) => {
  await page.goto("/play");
  await page.getByRole("button", { name: /Trail Scout/ }).click();
  await expect(page.locator("#seed-value")).not.toHaveText("");
  const seed = await page.locator("#seed-value").textContent();

  await page.reload();

  expect(new URL(page.url()).pathname).toBe("/play");
  expect(new URL(page.url()).search).toBe("");
  await expect(page.locator("#seed-value")).toHaveText(seed ?? "");
  await expect(page.locator("#quest-stage")).toHaveText(
    /Labyrinth 1 of 20.*Foundation/
  );
});

test("uses newer Quest Progress instead of a stale active Run locator", async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "echo-maze:quest-progress:v1",
      JSON.stringify({
        version: 1,
        levelId: "trail-scout",
        labyrinthNumber: 2,
        completedLabyrinths: 1,
        usedMapFingerprints: [],
        usedQuestionIds: [],
        nextQuestionOrdinal: 0,
        complete: false
      })
    );
    localStorage.setItem(
      "echo-maze:active-run:v1",
      JSON.stringify({
        version: 1,
        seed: "STALE-LOCATOR",
        levelId: "bright-start",
        labyrinthNumber: 1
      })
    );
  });

  await page.goto("/play");

  await expect(page.locator("#quest-stage")).toContainText("Labyrinth 2 of 20");
  await expect(page.locator("#seed-value")).not.toHaveText("STALE-LOCATOR");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const locator = JSON.parse(
          localStorage.getItem("echo-maze:active-run:v1") ?? "null"
        );
        return `${locator?.levelId}:${locator?.labyrinthNumber}`;
      })
    )
    .toBe("trail-scout:2");
});

test("normalizes legacy root shared links to play without changing Labyrinth metadata", async ({ page }) => {
  await page.goto(
    "/?seed=LEGACY-THRESHOLD&level=trail-scout&labyrinth=13"
  );

  await expect(page.getByLabel(/Interactive maze/)).toBeVisible();
  const currentUrl = new URL(page.url());
  expect(currentUrl.pathname).toBe("/play");
  expect(currentUrl.searchParams.get("seed")).toBe("LEGACY-THRESHOLD");
  expect(currentUrl.searchParams.get("level")).toBe("trail-scout");
  expect(currentUrl.searchParams.get("labyrinth")).toBe("13");
  await expect(page.locator("#quest-stage")).toHaveText(
    /Labyrinth 13 of 20.*Advanced/
  );
});

test("normalizes invalid shared parameters with a readable notice", async ({ page }) => {
  await page.goto("/play?seed=bad%20seed!!&level=unknown&labyrinth=99");

  await expect(page.locator("#seed-value")).toHaveText("BAD-SEED");
  await expect(page.locator("#quest-stage")).toHaveText(
    /Labyrinth 1 of 20.*Foundation/
  );
  await expect(page.locator("#event-ribbon")).toHaveText(
    "This share link was adjusted to a safe Labyrinth."
  );
});

test("keeps the landing page operable at mobile width, reduced motion, and 200 percent text", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("link", { name: "Enter the Maze" }).focus();
  await expect(page.getByRole("link", { name: "Enter the Maze" })).toBeFocused();
  const landingActions = page.locator(".landing-page a:visible, .landing-page button:visible");
  for (let index = 0; index < (await landingActions.count()); index += 1) {
    const action = landingActions.nth(index);
    const bounds = await action.boundingBox();
    expect(bounds?.width, `landing action ${index} width`).toBeGreaterThanOrEqual(44);
    expect(bounds?.height, `landing action ${index} height`).toBeGreaterThanOrEqual(44);
  }

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const motionDuration = await page
    .locator(".landing-labyrinth-mark")
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(motionDuration) || 0).toBeLessThanOrEqual(0.001);
});

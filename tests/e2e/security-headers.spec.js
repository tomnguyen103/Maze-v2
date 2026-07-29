import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("echo-maze:first-light:v1", "seen");
  });
});

/** @param {string} policy */
function directives(policy) {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values.join(" ")];
      })
  );
}

test("serves the strict header set on the game document", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const headers = response?.headers() ?? {};

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["permissions-policy"]).toContain("geolocation=()");

  const policy = directives(headers["content-security-policy"] ?? "");
  expect(policy.get("default-src")).toBe("'self'");
  expect(policy.get("object-src")).toBe("'none'");
  expect(policy.get("base-uri")).toBe("'none'");
  expect(policy.get("frame-ancestors")).toBe("'none'");
  expect(policy.get("form-action")).toContain("https://checkout.stripe.com");
  expect(policy.get("script-src")).not.toContain("'unsafe-inline'");
  expect(policy.get("script-src")).not.toContain("'unsafe-eval'");
});

test("boots and plays a Labyrinth with no Content Security Policy violation", async ({
  page
}) => {
  /** @type {string[]} */
  const violations = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      text.includes("Content Security Policy") ||
      text.includes("Refused to")
    ) {
      violations.push(text);
    }
  });
  /** @type {string[]} */
  const failures = [];
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (failure.includes("blocked")) {
      failures.push(`${request.url()} ${failure}`);
    }
  });

  await page.goto("/play");
  await page.getByRole("button", { name: /Trail Scout/ }).click();
  await expect(page.getByLabel(/Interactive maze/)).toBeVisible();
  // A handful of moves exercises the lazily loaded Fog, Pulse, and Warden
  // Question paths, which is where a too-strict policy would surface.
  for (const key of ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"]) {
    await page.keyboard.press(key);
  }

  expect(violations).toEqual([]);
  expect(failures).toEqual([]);
});

test("normal play never spends a rate-limit budget", async ({ page }) => {
  /** @type {number[]} */
  const statuses = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/")) {
      statuses.push(response.status());
    }
  });

  await page.route("**/api/leaderboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ globalMaxScore: 0, entries: [] })
    })
  );
  const leaderboardLoaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/leaderboard"
  );
  await page.goto("/play");
  await leaderboardLoaded;
  await page.getByRole("button", { name: /Trail Scout/ }).click();
  await expect(page.getByLabel(/Interactive maze/)).toBeVisible();
  for (const key of ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"]) {
    await page.keyboard.press(key);
  }

  // Without this the assertion below passes vacuously whenever the flow makes
  // no API call at all, which would prove nothing about the limiter.
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses).not.toContain(429);
});

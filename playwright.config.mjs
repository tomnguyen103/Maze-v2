import { defineConfig, devices } from "@playwright/test";

/*
 * Does the browser suite join `npm run check`? No — decided deliberately
 * (audit finding T-05).
 *
 * `check` is the pre-push gate and has to stay runnable on a clean clone with
 * no browser download and no network. Playwright needs both. `check:full`
 * (`check` + `test:e2e` + `test:e2e:xbrowser`) is the pre-release gate and is what a browser matrix
 * is run through. The two failure modes T-05 named are closed inside this
 * config instead: `forbidOnly` stops a committed `test.only` from narrowing
 * the suite silently, and reuse of an already-running preview is now opt-in
 * so the suite cannot pass against a stale bundle.
 */

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Every worker drives its own Chromium against ONE shared Vite preview.
  // Eight was stable at 111 tests, but the 122-test Phase 8 suite reproduced
  // two different desktop boot/hydration flakes in consecutive full runs.
  // Four keeps the preview responsive without retries or weaker assertions.
  workers: 4,
  // A committed `test.only` silently narrows the suite and still exits 0.
  // Actions are disabled for this repo, so nothing downstream would catch it.
  forbidOnly: true,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] }
    },
    // Cross-browser matrix: `npm run test:e2e:xbrowser`. WebKit on Windows runs
    // the 4-viewport tests near the 30 s default, so these projects get 60 s.
    { name: "firefox", timeout: 60_000, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", timeout: 60_000, use: { ...devices["Desktop Safari"] } },
    { name: "iphone", timeout: 60_000, use: { ...devices["iPhone 14"] } }
  ],
  webServer: {
    // The server builds the e2e bundle, with its test player seam, into its own
    // directory. A direct `npx playwright test` therefore never serves the
    // production bundle, and `dist/` keeps the production build (B-142).
    command:
      "npx vite build --mode e2e --outDir dist-e2e && npx vite preview --host 127.0.0.1 --outDir dist-e2e",
    timeout: 180_000,
    url: "http://127.0.0.1:4173",
    // Reuse attaches to whatever already answers on :4173 and skips the e2e
    // build, so the suite can run against a stale or production bundle. Default
    // to our own server and make reuse an explicit opt-in (`PW_REUSE_SERVER=1`)
    // for a preview of `dist-e2e` that you started yourself.
    // (`process.env.CI` is the usual switch, but Actions are disabled for this
    // repo and nothing sets `CI`, so keying on it would leave reuse always on.)
    reuseExistingServer: process.env.PW_REUSE_SERVER === "1"
  }
});

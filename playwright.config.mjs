import { defineConfig, devices } from "@playwright/test";

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
    }
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    // Reusing whatever already answers on :4173 can attach to a preview
    // started before the current `vite build`, so the suite passes against a
    // stale bundle. Default to starting our own server and make reuse an
    // explicit local-iteration opt-in: `PW_REUSE_SERVER=1 npm run test:e2e`.
    // (`process.env.CI` is the usual switch, but Actions are disabled for this
    // repo and nothing sets `CI`, so keying on it would leave reuse always on.)
    reuseExistingServer: process.env.PW_REUSE_SERVER === "1"
  }
});

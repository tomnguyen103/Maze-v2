import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Half the local default of 16 (32 logical cores). Every worker drives its
  // own Chromium against ONE shared vite preview process, and at 16 workers
  // the box oversubscribes: app boot and Clerk initialisation stretch past
  // their expectation bounds, so ~1 run in 3 failed on load latency unrelated
  // to the change under test. Eight sustains sub-5s boots with a full queue.
  workers: 8,
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
    reuseExistingServer: true
  }
});

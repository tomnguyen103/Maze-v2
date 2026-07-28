import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Every worker drives its own Chromium against ONE shared Vite preview.
  // Eight was stable at 111 tests, but the 122-test Phase 8 suite reproduced
  // two different desktop boot/hydration flakes in consecutive full runs.
  // Four keeps the preview responsive without retries or weaker assertions.
  workers: 4,
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

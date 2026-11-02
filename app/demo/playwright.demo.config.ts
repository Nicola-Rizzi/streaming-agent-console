import { defineConfig, devices } from "@playwright/test";

/**
 * Records docs/demo.gif: the real app in a real browser against a fresh mock service,
 * the same setup as the end-to-end tests, a little faster so the GIF stays short.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "*.demo.ts",
  timeout: 180_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5199" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 720 } } }],
  webServer: [
    {
      command: "npm --prefix ../server start",
      cwd: "..",
      env: { PORT: "8799", MOCK_SPEED: "3" },
      url: "http://localhost:8799/api/threads",
      reuseExistingServer: false,
    },
    {
      command: "npx vite --config e2e/vite.e2e.config.ts",
      cwd: "..",
      url: "http://localhost:5199",
      reuseExistingServer: false,
    },
  ],
});

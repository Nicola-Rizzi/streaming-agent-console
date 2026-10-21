import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end: the real app in a real browser against a fresh mock service.
 * Each run starts its own service, so every thread has all its recorded turns.
 * Kept out of `npm test`: it depends on real timing, the unit suite doesn't.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 180_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5199",
    viewport: { width: 1280, height: 860 },
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } }],
  webServer: [
    {
      command: "npm --prefix ../server start",
      // Fast, but slow enough that silent-stall's 45 s silence (22.5 s here) outlasts the 15 s stall detector.
      env: { PORT: "8799", MOCK_SPEED: "2" },
      url: "http://localhost:8799/api/threads",
      reuseExistingServer: false,
    },
    {
      command: "npx vite --config e2e/vite.e2e.config.ts",
      url: "http://localhost:5199",
      reuseExistingServer: false,
    },
  ],
});

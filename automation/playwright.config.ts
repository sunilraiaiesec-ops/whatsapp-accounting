import { defineConfig, devices } from "@playwright/test";
import { BANTOO_BASE_URL } from "./helpers/config";

/**
 * Config for the tutorial automation framework — a recording tool, not a CI
 * test suite. Run with:
 *
 *   npx playwright test --config=automation/playwright.config.ts automation/tutorials/create-a-customer.spec.ts
 *
 * or, from the repo root, via the npm script wrappers:
 *
 *   npm run record:tutorial -- automation/tutorials/create-a-customer.spec.ts
 *   npm run record:list
 *
 * See automation/README.md for the full recording workflow.
 */
export default defineConfig({
  testDir: "./tutorials",

  // These are slow, deliberately-paced, single-user walkthroughs meant to be
  // screen-recorded one at a time — never in parallel, never retried
  // automatically (a flaky retry mid-recording would be worse than a clean
  // failure), and with a generous timeout since real pauses are baked in.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 5 * 60 * 1000,

  reporter: [["list"]],

  use: {
    baseURL: BANTOO_BASE_URL,
    // Always headed — a headless browser can't be screen-recorded.
    headless: false,
    viewport: { width: 1440, height: 900 },
    trace: "off",
    video: "off",
    screenshot: "off",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

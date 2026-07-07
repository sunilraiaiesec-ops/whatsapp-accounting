import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Dedicated recording profile for the one-click recording pipeline
 * (`tutorial-factory/record-tutorial.js`) — a permanent, separate config
 * rather than temporarily hand-editing `playwright.config.ts`'s `video`/
 * `trace` fields and reverting them after every live-verification round,
 * the way this session's earlier live-test rounds did.
 *
 * Extends (not duplicates) the base config via Playwright's own
 * `defineConfig(base, overrides)` merge support, so every other setting —
 * `testDir`, one-worker/no-parallel/no-retries, the 5-minute timeout,
 * `baseURL` from `BANTOO_BASE_URL`, headed Chromium at 1440x900 — stays
 * defined in exactly one place (`playwright.config.ts`) and can never drift
 * out of sync between the two profiles. Only `video`/`trace` differ here.
 *
 * `outputDir` is intentionally left unset here — `record-tutorial.js`
 * always passes an explicit `--output=<dir>` on the CLI per run, scoped to
 * that one tutorial_id, so recordings from different tutorials (or
 * different takes of the same one) never land in the same folder and never
 * get mixed up or overwritten mid-run.
 *
 * Run directly (rarely needed — normally invoked by
 * `npm run record:video -- <tutorial_id>`):
 *
 *   npx playwright test --config=automation/playwright.recording.config.ts \
 *     automation/tutorials/create-a-customer.spec.ts \
 *     --output=automation/.recording-output/create-a-customer
 */
export default defineConfig(baseConfig, {
  use: {
    video: "on",
    trace: "on",
  },
});

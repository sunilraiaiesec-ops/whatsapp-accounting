/**
 * Waits for the page to settle after a navigation or client-side transition:
 * network-idle first (covers full page loads and Next.js RSC navigations),
 * then a small fixed buffer to cover CSS transitions/animations that don't
 * involve any network activity (e.g. a dropdown opening, a highlight fading).
 */

import type { Page } from "@playwright/test";
import { PACE } from "./config";

export async function waitForAnimation(page: Page, bufferMs: number = PACE.scrollSettleMs): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {
    // A long-lived connection (e.g. dev-server HMR websocket) can keep the
    // network "busy" forever — don't let that block the recording.
  });
  await page.waitForTimeout(bufferMs);
}

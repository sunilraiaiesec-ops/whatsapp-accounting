/**
 * A plain, deliberate pause for the recorder to "breathe" — call after every
 * meaningful step (a form filled, a submit clicked, a page landed on).
 */

import type { Page } from "@playwright/test";
import { PACE } from "./config";

export async function pause(page: Page, seconds: number = PACE.pauseSeconds): Promise<void> {
  await page.waitForTimeout(Math.round(seconds * 1000));
}

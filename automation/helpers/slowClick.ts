/**
 * Clicks an element the way a person recording a tutorial would: scroll it
 * smoothly into view, highlight it, glide the mouse over to it, THEN click —
 * never an instant jump-and-click.
 */

import type { Locator, Page } from "@playwright/test";
import { PACE } from "./config";
import { moveMouseSmoothly } from "./cursor";
import { highlight, unhighlight } from "./highlight";

async function smoothScrollIntoView(page: Page, locator: Locator): Promise<void> {
  const handle = await locator.elementHandle().catch(() => null);
  if (handle) {
    await page.evaluate((el) => {
      (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
    }, handle);
  } else {
    // Fallback for locators that can't resolve an element handle yet
    // (e.g. still animating in) — an instant scroll beats not scrolling at all.
    await locator.scrollIntoViewIfNeeded().catch(() => {});
  }
  await page.waitForTimeout(PACE.scrollSettleMs);
}

export async function slowClick(page: Page, locator: Locator): Promise<void> {
  await smoothScrollIntoView(page, locator);
  await highlight(page, locator); // mark it, pause, THEN click (requirement: highlight before click)

  const box = await locator.boundingBox();
  if (box) {
    await moveMouseSmoothly(page, box.x + box.width / 2, box.y + box.height / 2);
  }

  await locator.click();
  await unhighlight(page, locator);
}

/**
 * Same slow, highlighted treatment as `slowClick`, but for a <select> —
 * every tutorial in this project leans heavily on dropdowns (customer, bank
 * account, item, payment method, income account...), so this lives next to
 * slowClick rather than being re-implemented inline in every spec.
 */
export async function slowSelect(
  page: Page,
  locator: Locator,
  option: { label?: string; value?: string },
): Promise<void> {
  await smoothScrollIntoView(page, locator);
  await highlight(page, locator);

  const box = await locator.boundingBox();
  if (box) {
    await moveMouseSmoothly(page, box.x + box.width / 2, box.y + box.height / 2);
  }

  await locator.selectOption(option.label ? { label: option.label } : { value: option.value });
  await unhighlight(page, locator);
}

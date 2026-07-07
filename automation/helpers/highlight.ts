/**
 * Visually marks an element (a temporary orange glow) so a viewer watching
 * the recording can see what's about to happen before it happens. Used by
 * slowClick/slowType internally, and exported so a spec can call it on its
 * own — e.g. to highlight a status badge or total after an action, with
 * nothing to click.
 */

import type { Locator, Page } from "@playwright/test";
import { PACE } from "./config";

export async function highlight(page: Page, locator: Locator, ms: number = PACE.highlightMs): Promise<void> {
  const handle = await locator.elementHandle();
  if (!handle) return;
  await page.evaluate((el) => {
    const node = el as HTMLElement;
    node.setAttribute("data-bantoo-prev-outline", node.style.outline || "");
    node.setAttribute("data-bantoo-prev-shadow", node.style.boxShadow || "");
    node.style.transition = "outline-color 150ms ease, box-shadow 150ms ease";
    node.style.outline = "3px solid #ff5a1e";
    node.style.outlineOffset = "2px";
    node.style.boxShadow = "0 0 0 6px rgba(255, 90, 30, 0.25)";
  }, handle);
  await page.waitForTimeout(ms);
}

/** Removes a highlight applied by `highlight()`. Safe to call even if nothing was highlighted. */
export async function unhighlight(page: Page, locator: Locator): Promise<void> {
  const handle = await locator.elementHandle().catch(() => null);
  if (!handle) return;
  await page
    .evaluate((el) => {
      const node = el as HTMLElement;
      node.style.outline = node.getAttribute("data-bantoo-prev-outline") ?? "";
      node.style.boxShadow = node.getAttribute("data-bantoo-prev-shadow") ?? "";
      node.removeAttribute("data-bantoo-prev-outline");
      node.removeAttribute("data-bantoo-prev-shadow");
    }, handle)
    .catch(() => {
      // Element may have unmounted (e.g. we just navigated) — nothing to clean up.
    });
}

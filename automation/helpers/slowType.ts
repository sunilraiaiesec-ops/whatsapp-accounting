/**
 * Types into a field character-by-character with a small realistic delay,
 * after highlighting the field — never an instant `.fill()`.
 */

import type { Locator, Page } from "@playwright/test";
import { PACE } from "./config";
import { highlight, unhighlight } from "./highlight";

export async function slowType(
  page: Page,
  locator: Locator,
  text: string,
  opts: { clearFirst?: boolean; delayMs?: number } = {},
): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await highlight(page, locator);
  await locator.click();

  // Native `<input type="date">` (and type="time"/"month"/"week") elements
  // are segmented pickers, not plain text fields: typing an ISO string like
  // "2026-08-05" key-by-key sends literal "-" keystrokes into the
  // year/month/day segments, which the browser doesn't accept as segment
  // separators — the value ends up incomplete and the browser's native
  // validation blocks form submission ("Please enter a valid value. The
  // field is incomplete or has an invalid date."), found via a live
  // create-a-sales-invoice run. `.fill()` sets these inputs' value directly
  // (Playwright's documented approach for date/time inputs) and is the only
  // reliable way to populate them — there's no meaningful "smooth typing"
  // simulation for a segmented widget anyway, so we skip pressSequentially
  // for this input type only; every other field keeps typing char-by-char.
  const inputType = await locator.getAttribute("type").catch(() => null);
  if (inputType && ["date", "time", "month", "week"].includes(inputType)) {
    await locator.fill(text);
  } else {
    if (opts.clearFirst ?? true) {
      await locator.fill("");
    }
    await locator.pressSequentially(text, { delay: opts.delayMs ?? PACE.typeDelayMs });
  }

  await unhighlight(page, locator);
}

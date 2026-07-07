/**
 * Replays tutorial "create-a-supplier" (tutorials/002-create-a-supplier.md)
 * against the live BantooBooks UI. Same form as create-a-customer.spec.ts
 * (PartyCreateForm, just defaulted to "Supplier" on /suppliers) — see that
 * spec for the fuller commentary; kept separate per-tutorial rather than
 * parameterized so each file stays a 1:1, readable mirror of its tutorial.
 *
 * Idempotency strategy: identical to create-a-customer.spec.ts — try the
 * exact test_data name, and if the duplicate-detection panel appears, click
 * "Use existing contact" instead of creating another copy. No new-row
 * clutter build-up across repeated recordings/retakes.
 */

import { expect, test } from "@playwright/test";
import {
  loadTutorial,
  login,
  pause,
  slowClick,
  slowType,
  waitForAnimation,
} from "../helpers";
import { slowSelect } from "../helpers/slowClick";

const tutorial = loadTutorial("create-a-supplier");
const data = tutorial.test_data as Record<string, string>;

test(`${tutorial.tutorial_id}: ${tutorial.title}`, async ({ page }) => {
  await login(page);

  // Step 1 — dashboard "+ Add supplier" pill.
  await slowClick(page, page.getByRole("link", { name: "Add supplier" }));
  await waitForAnimation(page);
  await expect(page).toHaveURL(/\/suppliers$/);

  // Step 2 — Name.
  await slowType(page, page.locator('input[name="name"]'), data.name);
  await pause(page, 1);

  // Step 3 — confirm Type already shows "Supplier".
  const typeSelect = page.locator('select[name="type"]');
  await slowSelect(page, typeSelect, { label: data.type });
  await pause(page, 1);

  // Step 4 — Phone.
  await slowType(page, page.locator('input[name="phone"]'), data.phone);

  // Step 5 — reveal WhatsApp / Country / City.
  await slowClick(page, page.getByRole("button", { name: "+ WhatsApp / Country / City" }));
  await pause(page, 1);

  // Step 6 — Country and City only; this supplier has no WhatsApp per test_data.
  await slowType(page, page.locator('input[name="country"]'), data.country);
  await slowType(page, page.locator('input[name="city"]'), data.city);

  // Step 7 — Add contact.
  await slowClick(page, page.getByRole("button", { name: "Add contact" }));
  await waitForAnimation(page);

  // Step 8 — handle the duplicate-detection panel if it appears.
  const duplicatePanel = page.getByText("Possible existing contact found");
  if (await duplicatePanel.isVisible().catch(() => false)) {
    await pause(page, 1.5);
    await slowClick(page, page.getByRole("link", { name: "Use existing contact" }).first());
  } else {
    await expect(page).toHaveURL(/\/suppliers$/);
    await pause(page, 1);
    await slowClick(page, page.getByRole("link", { name: data.name, exact: true }).first());
  }

  // Step 9 — land on the contact's profile page and hold for the recording.
  await waitForAnimation(page);
  await expect(page.getByRole("heading", { name: data.name })).toBeVisible();
  await pause(page, 3);
});

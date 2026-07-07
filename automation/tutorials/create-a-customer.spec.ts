/**
 * Replays tutorial "create-a-customer" (tutorials/001-create-a-customer.md)
 * against the live BantooBooks UI, slowly and visibly enough for a screen
 * recorder to capture a clean walkthrough.
 *
 * Idempotency strategy: submit the quick-add form with the exact test_data
 * name. If BantooBooks' own duplicate-detection panel ("Possible existing
 * contact found") appears — meaning this script already created that exact
 * contact on a previous run — click "Use existing contact" rather than
 * "Create new anyway". That keeps the demo org tidy no matter how many times
 * this script is replayed (e.g. for a retake), and both paths converge on
 * the same finishing screen: the contact's profile page.
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

const tutorial = loadTutorial("create-a-customer");
const data = tutorial.test_data as Record<string, string>;

test(`${tutorial.tutorial_id}: ${tutorial.title}`, async ({ page }) => {
  await login(page);

  // Step 1 — dashboard "+ Add customer" pill.
  await slowClick(page, page.getByRole("link", { name: "Add customer" }));
  await waitForAnimation(page);
  await expect(page).toHaveURL(/\/customers$/);

  // Step 2 — Name.
  await slowType(page, page.locator('input[name="name"]'), data.name);
  await pause(page, 1);

  // Step 3 — confirm Type already shows the tutorial's expected default.
  const typeSelect = page.locator('select[name="type"]');
  await slowSelect(page, typeSelect, { label: data.type });
  await pause(page, 1);

  // Step 4 — Phone.
  await slowType(page, page.locator('input[name="phone"]'), data.phone);

  // Step 5 — reveal WhatsApp / Country / City.
  await slowClick(page, page.getByRole("button", { name: "+ WhatsApp / Country / City" }));
  await pause(page, 1);

  // Step 6 — WhatsApp, Country, City.
  await slowType(page, page.locator('input[name="whatsapp"]'), data.whatsapp);
  await slowType(page, page.locator('input[name="country"]'), data.country);
  await slowType(page, page.locator('input[name="city"]'), data.city);

  // Step 7 — Add contact.
  await slowClick(page, page.getByRole("button", { name: "Add contact" }));
  await waitForAnimation(page);

  // Step 8 — handle the duplicate-detection panel if it shows up (see the
  // idempotency note above).
  const duplicatePanel = page.getByText("Possible existing contact found");
  if (await duplicatePanel.isVisible().catch(() => false)) {
    await pause(page, 1.5);
    await slowClick(page, page.getByRole("link", { name: "Use existing contact" }).first());
  } else {
    // Fresh creation — the action redirected to /customers. Open the new
    // contact's profile to finish on a "completed" screen rather than mid-list.
    await expect(page).toHaveURL(/\/customers$/);
    await pause(page, 1);
    await slowClick(page, page.getByRole("link", { name: data.name, exact: true }).first());
  }

  // Step 9 — land on the contact's profile page and hold for the recording.
  await waitForAnimation(page);
  await expect(page.getByRole("heading", { name: data.name })).toBeVisible();
  await pause(page, 3);
});

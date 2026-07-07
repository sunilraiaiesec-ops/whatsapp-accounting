/**
 * Replays tutorial "add-inventory-item"
 * (tutorials/005-add-inventory-item.md) against the live BantooBooks UI.
 *
 * Finishing screen: inventory items have no per-item detail page (the list
 * page — components/InventoryItemForm.tsx's <ListView> — has no `href` on
 * its rows), so the natural "completed" state for this tutorial is the
 * Inventory items list itself, scrolled to and highlighting the new row.
 *
 * Idempotency strategy: InventoryItemForm has no duplicate-detection UI, and
 * the schema places no unique constraint on `code`, but two runs sharing the
 * exact same SKU would look like a confusing accidental duplicate in the
 * list. A short run-time suffix is appended to the Code field only — the
 * Name and every other field stay exactly as narrated in the tutorial, so
 * repeated runs show multiple rows with the same product name and different
 * SKUs, which is expected/acceptable for a demo org used for repeated
 * recordings.
 */

import { expect, test } from "@playwright/test";
import { loadTutorial, login, pause, slowClick, slowType, waitForAnimation } from "../helpers";

function runSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const tutorial = loadTutorial("add-inventory-item");
const data = tutorial.test_data as Record<string, string>;
const code = `${data.code}-${runSuffix()}`;

test(`${tutorial.tutorial_id}: ${tutorial.title}`, async ({ page }) => {
  await login(page);

  // Step 1 — dashboard "Inventory" category pill. `exact: true` matters
  // here: the sidebar also has a nav item whose accessible name is
  // "▦ Inventory" (icon + label), which contains "Inventory" as a
  // substring and would otherwise make this locator ambiguous (found via a
  // live run — see automation/README.md's "Lessons from live runs" note).
  await slowClick(page, page.getByRole("link", { name: "Inventory", exact: true }));
  await waitForAnimation(page);
  await expect(page).toHaveURL(/\/inventory-items$/);

  // Step 2 — Code (suffixed for idempotency — see file header).
  await slowType(page, page.locator('input[name="code"]'), code);

  // Step 3 — Name.
  await slowType(page, page.locator('input[name="name"]'), data.name);

  // Step 4 — Sale price.
  await slowType(page, page.locator('input[name="salePrice"]'), data.salePrice);

  // Step 5 — Barcode is left blank per test_data (optional field).
  await slowClick(page, page.locator('input[name="barcode"]'));
  await pause(page, 1);

  // Step 6 — Unit.
  await slowType(page, page.locator('input[name="unit"]'), data.unit);

  // Step 7 — Reorder level.
  await slowType(page, page.locator('input[name="reorderLevel"]'), data.reorderLevel);

  // Step 8 — Tax %.
  await slowType(page, page.locator('input[name="defaultTaxRate"]'), data.defaultTaxRate);

  // Step 9 — Add item.
  await slowClick(page, page.getByRole("button", { name: "Add item" }));
  await waitForAnimation(page);
  await expect(page).toHaveURL(/\/inventory-items$/);

  // Step 10 — the new row has no detail page to click into, so the list
  // itself (scrolled to the new row) is the finishing screen.
  await pause(page, 1);
  const newRow = page.locator("tr", { hasText: code });
  await newRow.scrollIntoViewIfNeeded();
  await slowClick(page, newRow.locator("td").first());
  await expect(page.getByText(code, { exact: true })).toBeVisible();
  await pause(page, 3);
});

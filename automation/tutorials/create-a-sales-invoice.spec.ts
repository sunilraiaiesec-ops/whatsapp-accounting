/**
 * Replays tutorial "create-a-sales-invoice"
 * (tutorials/003-create-a-sales-invoice.md) against the live BantooBooks UI.
 *
 * Prerequisite this script assumes (per the tutorial's own `prerequisites`):
 * a customer named exactly `test_data.customer` and an inventory item
 * labelled exactly `test_data.item` already exist in the demo org — both are
 * part of the seeded demo catalog, not created by this script.
 *
 * Line-item caveat: SalesInvoiceForm's line rows (components/SalesInvoiceForm.tsx)
 * are plain controlled <input>/<select> elements with NO `name` attribute —
 * the whole row is only serialized into a hidden JSON field on submit. So
 * unlike the top-level fields, the line cells below are located by column
 * position within the first row rather than by name. If that table's column
 * order ever changes, these locators need updating alongside it.
 *
 * Idempotency strategy: invoices have no duplicate-detection UI, and nothing
 * in the schema treats "reference" as unique, but a distinct value per run
 * keeps repeated recordings/retakes visually distinguishable rather than
 * looking like accidental re-submits. A short run-time suffix is appended to
 * the Reference field only — every other value stays exactly as narrated in
 * the tutorial.
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

function runSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const tutorial = loadTutorial("create-a-sales-invoice");
const data = tutorial.test_data as Record<string, string>;
const reference = `${data.reference}-${runSuffix()}`;

test(`${tutorial.tutorial_id}: ${tutorial.title}`, async ({ page }) => {
  await login(page);

  // Step 1 — dashboard "+ Create invoice" pill.
  await slowClick(page, page.getByRole("link", { name: "Create invoice" }));
  await waitForAnimation(page);
  await expect(page).toHaveURL(/\/sales-invoices\/new$/);

  // Step 2 — Customer.
  await slowSelect(page, page.locator('select[name="partyId"]'), { label: data.customer });
  await pause(page, 1);

  // Step 3 — Reference (suffixed for idempotency — see file header).
  await slowType(page, page.locator('input[name="reference"]'), reference);

  // Step 4 — Invoice date defaults to today already; Due date set 30 days out.
  const dateInput = page.locator('input[name="date"]');
  await dateInput.scrollIntoViewIfNeeded();
  await slowClick(page, dateInput); // just highlights + "confirms" it, no value change
  await slowType(page, page.locator('input[name="dueDate"]'), isoDatePlusDays(30));

  // Step 5 — first line's Item dropdown auto-fills Description + Unit price.
  const firstRow = page.locator("table tbody tr").first();
  const itemSelect = firstRow.locator("select").first();
  await slowSelect(page, itemSelect, { label: data.item });
  await pause(page, 2); // the "aha" moment — hold on the auto-filled row

  // Step 6 — Qty (3rd column: Item, Description, Qty).
  const qtyInput = firstRow.locator("td").nth(2).locator("input");
  await slowType(page, qtyInput, data.quantity);

  // Step 7 — Tax % (5th column: Item, Description, Qty, Unit price, Tax %).
  const taxInput = firstRow.locator("td").nth(4).locator("input");
  await slowType(page, taxInput, data.taxRate);

  // Step 8 — confirm the Income account column (6th column).
  const incomeAccountSelect = firstRow.locator("td").nth(5).locator("select");
  await slowSelect(page, incomeAccountSelect, { label: data.incomeAccount });

  // Step 9 — Notes.
  await slowType(page, page.locator('textarea[name="notes"]'), data.notes);

  // Step 10 — confirm the total before saving.
  await slowClick(page, page.getByText("Invoice total"));
  await pause(page, 2);

  // Step 11 — Save invoice.
  await slowClick(page, page.getByRole("button", { name: "Save invoice" }));
  await waitForAnimation(page);
  await expect(page).toHaveURL(/\/sales-invoices$/);

  // Step 12 — open the new invoice (newest row — the list sorts by date,
  // then createdAt, both descending) and finish on its detail page.
  await pause(page, 1);
  await slowClick(page, page.locator("table tbody tr").first().getByRole("link"));

  await waitForAnimation(page);
  await expect(page.getByRole("heading", { name: data.customer })).toBeVisible();
  await pause(page, 3);
});

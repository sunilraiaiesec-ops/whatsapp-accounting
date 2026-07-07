/**
 * Replays tutorial "record-customer-receipt"
 * (tutorials/004-record-customer-receipt.md) against the live BantooBooks
 * UI. Filename matches the tutorial_id exactly (the tutorial itself was
 * renamed from "record-customer-payment" — see tutorials/README.md — a
 * receipt is money coming IN from a customer, a payment is money going OUT).
 *
 * Prerequisite this script assumes: a customer named exactly
 * `test_data.receivedFrom` already exists in the demo org (seeded, and/or
 * created by create-a-customer.spec.ts).
 *
 * Category-details row caveat: like the sales invoice's line items,
 * CashDocForm's rows (components/CashDocForm.tsx) are controlled
 * <input>/<select> elements with no `name` attribute — located by column
 * position within the first row (see inline comments below).
 *
 * Idempotency strategy: no duplicate-detection UI exists for receipts, and
 * nothing enforces reference uniqueness, but a distinct value per run keeps
 * repeated recordings visually distinguishable. A short run-time suffix is
 * appended to the Reference no. field only.
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

const tutorial = loadTutorial("record-customer-receipt");
const data = tutorial.test_data as Record<string, string>;
const referenceNo = `${data.referenceNo}-${runSuffix()}`;

test(`${tutorial.tutorial_id}: ${tutorial.title}`, async ({ page }) => {
  await login(page);

  // Step 1 — dashboard "+ Record receipt" pill.
  await slowClick(page, page.getByRole("link", { name: "Record receipt" }));
  await waitForAnimation(page);
  await expect(page).toHaveURL(/\/receipts\/new$/);

  // Step 2 — Received from.
  await slowSelect(page, page.locator('select[name="partyId"]'), { label: data.receivedFrom });
  await pause(page, 1);

  // Step 3 — Deposit to (the account balance label appears right after selecting).
  await slowSelect(page, page.locator('select[name="bankAccountId"]'), { label: data.depositTo });
  await pause(page, 1.5);

  // Step 4 — Payment date defaults to today already; just confirm/highlight it.
  await slowClick(page, page.locator('input[name="date"]'));

  // Step 5 — Payment method.
  await slowSelect(page, page.locator('select[name="paymentMethod"]'), { label: data.paymentMethod });

  // Step 6 — Reference no. (suffixed for idempotency — see file header).
  await slowType(page, page.locator('input[name="reference"]'), referenceNo);

  // Step 7 — Category details, first row: Credit account (2nd column: #, Credit account).
  const firstRow = page.locator("table tbody tr").first();
  const creditAccountSelect = firstRow.locator("td").nth(1).locator("select");
  await slowSelect(page, creditAccountSelect, { label: data.creditAccount });

  // Step 8 — line Description (3rd column).
  const lineDescriptionInput = firstRow.locator("td").nth(2).locator("input");
  await slowType(page, lineDescriptionInput, data.lineDescription);

  // Step 9 — line Amount (6th column: #, Credit account, Description, Class, Tax rate, Amount).
  const amountInput = firstRow.locator("td").nth(5).locator("input");
  await slowType(page, amountInput, data.amount);

  // Step 10 — document-level Memo (separate field from the line Description above).
  await slowType(page, page.locator('textarea[name="description"]'), data.memo);

  // Step 11 — confirm "Amount received" total before saving.
  await slowClick(page, page.getByText("Amount received"));
  await pause(page, 2);

  // Step 12 — Save and close.
  await slowClick(page, page.getByRole("button", { name: "Save and close" }));
  await waitForAnimation(page);
  await expect(page).toHaveURL(/\/receipts$/);

  // Step 13 — open the new receipt (newest row — list sorts by date, then
  // createdAt, both descending) and finish on its detail page.
  await pause(page, 1);
  await slowClick(page, page.locator("table tbody tr").first().getByRole("link"));

  await waitForAnimation(page);
  await expect(page.getByRole("heading", { name: "Receipt" })).toBeVisible();
  // `.first()` matters here: the receipt detail page legitimately shows the
  // customer's name in three places (the header paragraph, the "Accounts
  // receivable — <customer>" category-details line, and again in the
  // Transaction Journal row) — a plain getByText without it throws a
  // strict-mode violation (found via a live run). The header occurrence
  // (first in DOM order) is the one we actually care about confirming.
  await expect(page.getByText(data.receivedFrom).first()).toBeVisible();
  await pause(page, 3);
});

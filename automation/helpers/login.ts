/**
 * Logs into BantooBooks as the demo organization and lands on the
 * dashboard. Every tutorial spec calls this first.
 *
 * See app/login/page.tsx in the ledger app — the form has plain
 * `input[name="email"]` / `input[name="password"]` fields with no
 * data-testid, so we select on `name`, which is stable across locales.
 */

import type { Page } from "@playwright/test";
import { BANTOO_BASE_URL, DEMO_EMAIL, DEMO_PASSWORD } from "./config";
import { pause } from "./pause";
import { slowClick } from "./slowClick";
import { slowType } from "./slowType";
import { waitForAnimation } from "./waitForAnimation";

export async function login(
  page: Page,
  opts: { email?: string; password?: string; baseUrl?: string } = {},
): Promise<void> {
  const baseUrl = opts.baseUrl ?? BANTOO_BASE_URL;
  const email = opts.email ?? DEMO_EMAIL;
  const password = opts.password ?? DEMO_PASSWORD;

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await waitForAnimation(page);

  await slowType(page, page.locator('input[name="email"]'), email);
  await slowType(page, page.locator('input[name="password"]'), password);
  await pause(page, 1);

  await slowClick(page, page.getByRole("button", { name: /sign in/i }));
  await page.waitForURL(`${baseUrl}/dashboard`, { timeout: 20000 });
  await waitForAnimation(page);
  await pause(page);
}

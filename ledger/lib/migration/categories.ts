import type { AccountType } from "@prisma/client";

// Balance-sheet category map used by Step 3 (opening balances) and Step 4
// (subledgers). Every category maps to a real `Account.subtype` so accounts
// are resolved/created exactly the way the rest of the app already does
// (see lib/accounts.ts, lib/chart-of-accounts.ts) — the wizard never invents
// a parallel account taxonomy.
//
// `kind`:
//  - "bank"      → every org account with subtype in ["bank","cash"]. Staged
//                  via MigrationBankBalance, one row per account. Also used
//                  by Step 4's Bank tab (same rows, same numbers).
//  - "subledger" → a control account (isControl) whose staged total is
//                  DERIVED from Step 4 (customer/supplier/inventory rows),
//                  never entered directly in Step 3.
//  - "plain"     → a normal account staged directly via
//                  MigrationOpeningBalance. Created on demand if the org has
//                  none of this subtype yet (ensureDefaultAccounts).

export type CategoryKind = "bank" | "subledger" | "plain";

export type SubledgerKind = "customer" | "supplier" | "inventory";

export type CategoryDef = {
  key: string;
  label: string;
  kind: CategoryKind;
  subtype: string;
  subledger?: SubledgerKind;
  // Used only for "plain" categories that don't yet exist for the org —
  // ensureDefaultAccounts() creates exactly this account so the category
  // always has at least one row to stage a balance against.
  defaultAccount?: { code: string; name: string };
};

export const ASSET_CATEGORIES: CategoryDef[] = [
  { key: "bank_cash", label: "Cash & Bank Accounts", kind: "bank", subtype: "bank" },
  {
    key: "receivable",
    label: "Accounts Receivable",
    kind: "subledger",
    subtype: "receivable",
    subledger: "customer",
  },
  {
    key: "inventory",
    label: "Inventory",
    kind: "subledger",
    subtype: "inventory",
    subledger: "inventory",
  },
  {
    key: "fixed_asset",
    label: "Fixed Assets",
    kind: "plain",
    subtype: "fixed_asset",
    defaultAccount: { code: "1500", name: "Fixed assets" },
  },
  {
    key: "investment",
    label: "Investments",
    kind: "plain",
    subtype: "investment",
    defaultAccount: { code: "1510", name: "Investments" },
  },
  {
    key: "deposit",
    label: "Deposits",
    kind: "plain",
    subtype: "deposit",
    defaultAccount: { code: "1520", name: "Deposits" },
  },
];

export const LIABILITY_CATEGORIES: CategoryDef[] = [
  {
    key: "payable",
    label: "Accounts Payable",
    kind: "subledger",
    subtype: "payable",
    subledger: "supplier",
  },
  {
    key: "loan",
    label: "Loans",
    kind: "plain",
    subtype: "loan",
    defaultAccount: { code: "2050", name: "Loans payable" },
  },
  {
    key: "credit_card",
    label: "Credit Cards",
    kind: "plain",
    subtype: "credit_card",
    defaultAccount: { code: "2200", name: "Credit cards" },
  },
  {
    key: "payroll_liability",
    label: "Payroll Liabilities",
    kind: "plain",
    subtype: "payroll_liability",
    defaultAccount: { code: "2300", name: "Payroll liabilities" },
  },
  {
    key: "tax",
    label: "Tax Payable",
    kind: "plain",
    subtype: "tax",
    defaultAccount: { code: "2100", name: "Tax payable" },
  },
];

export const EQUITY_CATEGORIES: CategoryDef[] = [
  {
    key: "equity",
    label: "Owner Capital",
    kind: "plain",
    subtype: "equity",
    defaultAccount: { code: "3000", name: "Owner's equity" },
  },
  {
    key: "retained",
    label: "Retained Earnings",
    kind: "plain",
    subtype: "retained",
    defaultAccount: { code: "3900", name: "Retained earnings" },
  },
  {
    key: "opening_equity",
    label: "Opening Equity",
    kind: "plain",
    subtype: "opening_equity",
    defaultAccount: { code: "3950", name: "Opening balance equity" },
  },
];

export const CATEGORIES_BY_TYPE: Record<"ASSET" | "LIABILITY" | "EQUITY", CategoryDef[]> = {
  ASSET: ASSET_CATEGORIES,
  LIABILITY: LIABILITY_CATEGORIES,
  EQUITY: EQUITY_CATEGORIES,
};

export const BALANCE_SHEET_TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY"];

export function allCategories(): CategoryDef[] {
  return [...ASSET_CATEGORIES, ...LIABILITY_CATEGORIES, ...EQUITY_CATEGORIES];
}

export function findCategory(subtype: string | null): CategoryDef | undefined {
  if (!subtype) return undefined;
  return allCategories().find((c) => c.subtype === subtype);
}

// "Plain" categories that should have at least one account created for the
// org before Step 3 renders, so the user always has somewhere to type a
// balance. Bank/subledger categories are intentionally excluded — bank
// accounts are added explicitly (there is no sensible single default bank
// account to auto-create), and subledger totals come from Step 4.
export function plainCategoriesNeedingDefaultAccount(): CategoryDef[] {
  return allCategories().filter((c) => c.kind === "plain" && c.defaultAccount);
}

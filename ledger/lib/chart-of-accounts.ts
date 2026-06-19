import type { AccountType } from "@prisma/client";

export type SeedAccount = {
  code: string;
  name: string;
  type: AccountType;
  subtype?: string;
  isControl?: boolean;
};

// A starter chart of accounts created for every new organization.
// Control accounts (AR / AP / Inventory) back their respective subledgers and
// must always be posted to through the subledger, never directly by hand.
export const DEFAULT_CHART_OF_ACCOUNTS: SeedAccount[] = [
  // Assets
  { code: "1000", name: "Cash on hand", type: "ASSET", subtype: "cash" },
  { code: "1010", name: "Bank accounts", type: "ASSET", subtype: "bank" },
  {
    code: "1100",
    name: "Accounts receivable",
    type: "ASSET",
    subtype: "receivable",
    isControl: true,
  },
  {
    code: "1200",
    name: "Inventory on hand",
    type: "ASSET",
    subtype: "inventory",
    isControl: true,
  },
  { code: "1500", name: "Fixed assets", type: "ASSET", subtype: "fixed_asset" },

  // Liabilities
  {
    code: "2000",
    name: "Accounts payable",
    type: "LIABILITY",
    subtype: "payable",
    isControl: true,
  },
  { code: "2100", name: "Tax payable", type: "LIABILITY", subtype: "tax" },

  // Equity
  { code: "3000", name: "Owner's equity", type: "EQUITY", subtype: "equity" },
  {
    code: "3900",
    name: "Retained earnings",
    type: "EQUITY",
    subtype: "retained",
  },

  // Income
  { code: "4000", name: "Sales", type: "INCOME", subtype: "sales" },
  { code: "4900", name: "Other income", type: "INCOME" },

  // Expenses
  { code: "5000", name: "Cost of goods sold", type: "EXPENSE", subtype: "cogs" },
  { code: "6000", name: "General expenses", type: "EXPENSE" },
  { code: "6100", name: "Salaries & wages", type: "EXPENSE" },
  { code: "6200", name: "Rent", type: "EXPENSE" },
  { code: "6300", name: "Transport & fuel", type: "EXPENSE" },
  { code: "6900", name: "Bank charges", type: "EXPENSE" },
];

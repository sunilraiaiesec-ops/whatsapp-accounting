import { allCategories, type CategoryDef } from "@/lib/migration/categories";
import type { WizardState } from "@/lib/migration/types";

export type CategoryTotal = {
  key: string;
  label: string;
  type: "ASSET" | "LIABILITY" | "EQUITY";
  amount: bigint;
  // "derived" categories (receivable/payable/inventory/bank) are computed
  // from Step 4 rows, never entered directly in Step 3.
  derived: boolean;
};

export type TrialBalanceResult = {
  totalAssets: bigint;
  totalLiabilities: bigint;
  totalEquity: bigint;
  // Assets − (Liabilities + Equity). Zero means the staged books balance.
  difference: bigint;
  balanced: boolean;
  categories: CategoryTotal[];
};

function categoryAccountType(cat: CategoryDef): "ASSET" | "LIABILITY" | "EQUITY" {
  return (["fixed_asset", "investment", "deposit", "bank_cash", "receivable", "inventory"].includes(
    cat.key,
  )
    ? "ASSET"
    : ["loan", "credit_card", "payroll_liability", "tax", "payable"].includes(cat.key)
      ? "LIABILITY"
      : "EQUITY") as "ASSET" | "LIABILITY" | "EQUITY";
}

function sumBy<T>(rows: T[], amount: (r: T) => bigint): bigint {
  return rows.reduce((s, r) => s + amount(r), 0n);
}

export function categoryTotal(cat: CategoryDef, state: WizardState): bigint {
  if (cat.kind === "bank") return sumBy(state.bankBalances, (r) => r.amount);
  if (cat.subledger === "customer") return sumBy(state.customerBalances, (r) => r.amount);
  if (cat.subledger === "supplier") return sumBy(state.supplierBalances, (r) => r.amount);
  if (cat.subledger === "inventory") return sumBy(state.inventoryBalances, (r) => r.totalValue);

  const accountIds = new Set(
    state.accounts.filter((a) => a.subtype === cat.subtype).map((a) => a.id),
  );
  return sumBy(
    state.openingBalances.filter((r) => accountIds.has(r.accountId)),
    (r) => r.amount,
  );
}

// Computes the live staged trial balance from every staging table. This is
// the single source of truth for "is the wizard balanced yet" — Step 5's
// live banner, Step 5C's health score, and the Finish gate all call this
// same function so they can never disagree.
export function computeTrialBalance(state: WizardState): TrialBalanceResult {
  const categories: CategoryTotal[] = allCategories().map((cat) => ({
    key: cat.key,
    label: cat.label,
    type: categoryAccountType(cat),
    amount: categoryTotal(cat, state),
    derived: cat.kind !== "plain",
  }));

  const totalAssets = sumBy(categories.filter((c) => c.type === "ASSET"), (c) => c.amount);
  const totalLiabilities = sumBy(categories.filter((c) => c.type === "LIABILITY"), (c) => c.amount);
  const totalEquity = sumBy(categories.filter((c) => c.type === "EQUITY"), (c) => c.amount);
  const difference = totalAssets - (totalLiabilities + totalEquity);

  return {
    totalAssets,
    totalLiabilities,
    totalEquity,
    difference,
    balanced: difference === 0n,
    categories,
  };
}

// Step 4 reconciliation guard: Step 3's AR/AP totals are DERIVED from Step 4
// by construction (categoryTotal above sums the same rows Step 3 would show
// as read-only), so this can never disagree — this helper exists purely so
// callers (and tests) have an explicit, named assertion of that invariant
// rather than relying on the derivation being correct by accident.
export function arMatchesSubledger(state: WizardState): boolean {
  const ar = state.openingBalances
    .filter((r) => {
      const acc = state.accounts.find((a) => a.id === r.accountId);
      return acc?.subtype === "receivable";
    })
    .reduce((s, r) => s + r.amount, 0n);
  const subledger = state.customerBalances.reduce((s, r) => s + r.amount, 0n);
  // `ar` should always be 0 in this architecture (nothing is ever written to
  // MigrationOpeningBalance for a receivable-subtype account), confirming
  // Step 3's AR figure comes exclusively from Step 4.
  return ar === 0n || ar === subledger;
}

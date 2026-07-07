import { describe, expect, it } from "vitest";

import { arMatchesSubledger, categoryTotal, computeTrialBalance } from "@/lib/migration/validation";
import { allCategories } from "@/lib/migration/categories";
import type { AccountSummary, WizardState } from "@/lib/migration/types";

function account(overrides: Partial<AccountSummary> & { id: string; subtype: string }): AccountSummary {
  return {
    code: overrides.id,
    name: overrides.id,
    type: "ASSET",
    isControl: false,
    currency: null,
    ...overrides,
  };
}

function baseState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    wizard: {
      id: "wiz_1",
      orgId: "org_1",
      status: "in_progress",
      currentStep: 3,
      openingDate: "2026-01-01",
      completedAt: null,
      completedById: null,
    },
    accounts: [],
    customers: [],
    suppliers: [],
    items: [],
    openingBalances: [],
    bankBalances: [],
    customerBalances: [],
    supplierBalances: [],
    inventoryBalances: [],
    acknowledgedWarnings: [],
    ...overrides,
  };
}

describe("computeTrialBalance", () => {
  it("reports balanced (difference === 0) for a fully balanced set of staged balances", () => {
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET" });
    const equity = account({ id: "acc_equity", subtype: "equity", type: "EQUITY" });
    const state = baseState({
      accounts: [bank, equity],
      bankBalances: [{ accountId: bank.id, amount: 1_000_000n }],
      openingBalances: [{ accountId: equity.id, amount: 1_000_000n }],
    });

    const tb = computeTrialBalance(state);
    expect(tb.totalAssets).toBe(1_000_000n);
    expect(tb.totalEquity).toBe(1_000_000n);
    expect(tb.totalLiabilities).toBe(0n);
    expect(tb.difference).toBe(0n);
    expect(tb.balanced).toBe(true);
  });

  it("reports unbalanced with a nonzero difference when assets and equity don't match", () => {
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET" });
    const equity = account({ id: "acc_equity", subtype: "equity", type: "EQUITY" });
    const state = baseState({
      accounts: [bank, equity],
      bankBalances: [{ accountId: bank.id, amount: 1_000_000n }],
      openingBalances: [{ accountId: equity.id, amount: 400_000n }],
    });

    const tb = computeTrialBalance(state);
    expect(tb.difference).toBe(600_000n);
    expect(tb.balanced).toBe(false);
  });

  it("derives Accounts Receivable, Accounts Payable and Inventory totals from Step 4 rows, not from Step 3 entries", () => {
    const state = baseState({
      customerBalances: [
        { partyId: "cust_1", amount: 100_000n },
        { partyId: "cust_2", amount: 50_000n },
      ],
      supplierBalances: [{ partyId: "sup_1", amount: 30_000n }],
      inventoryBalances: [
        { itemId: "item_1", quantity: "10", unit: "pcs", unitCost: 5_000n, totalValue: 50_000n, warehouse: null },
      ],
    });

    const receivableCat = allCategories().find((c) => c.key === "receivable")!;
    const payableCat = allCategories().find((c) => c.key === "payable")!;
    const inventoryCat = allCategories().find((c) => c.key === "inventory")!;

    expect(categoryTotal(receivableCat, state)).toBe(150_000n);
    expect(categoryTotal(payableCat, state)).toBe(30_000n);
    expect(categoryTotal(inventoryCat, state)).toBe(50_000n);

    const tb = computeTrialBalance(state);
    expect(tb.totalAssets).toBe(200_000n); // 150k AR + 50k inventory
    expect(tb.totalLiabilities).toBe(30_000n);
  });

  it("treats an empty wizard as trivially balanced (0 = 0)", () => {
    const tb = computeTrialBalance(baseState());
    expect(tb.balanced).toBe(true);
    expect(tb.difference).toBe(0n);
  });
});

describe("arMatchesSubledger", () => {
  it("holds by construction since AR is never written to MigrationOpeningBalance directly", () => {
    const state = baseState({
      customerBalances: [{ partyId: "cust_1", amount: 200_000n }],
    });
    expect(arMatchesSubledger(state)).toBe(true);
  });
});

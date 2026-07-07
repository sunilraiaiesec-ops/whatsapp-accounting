import { describe, expect, it } from "vitest";

import { computeConsistencyWarnings, unacknowledgedWarnings } from "@/lib/migration/consistency";
import type { AccountSummary, PartySummary, WizardState } from "@/lib/migration/types";

function account(overrides: Partial<AccountSummary> & { id: string; subtype: string; type: AccountSummary["type"] }): AccountSummary {
  return { code: overrides.id, name: overrides.id, isControl: false, currency: null, ...overrides };
}

function party(overrides: Partial<PartySummary> & { id: string; name: string; type: string }): PartySummary {
  return { phone: null, ...overrides };
}

function baseState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    wizard: { id: "wiz_1", orgId: "org_1", status: "in_progress", currentStep: 5, openingDate: "2026-01-01", completedAt: null, completedById: null },
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

describe("computeConsistencyWarnings", () => {
  it("flags negative inventory quantity", () => {
    const item = { id: "item_1", code: "SKU-1", name: "Rice 25kg", unit: "bag" };
    const state = baseState({
      items: [item],
      inventoryBalances: [{ itemId: item.id, quantity: "-3", unit: "bag", unitCost: 1000n, totalValue: -3000n, warehouse: null }],
    });
    const warnings = computeConsistencyWarnings(state);
    expect(warnings.some((w) => w.code === `negative_inventory:${item.id}`)).toBe(true);
  });

  it("flags inventory quantity without a cost, and value without a quantity", () => {
    const item1 = { id: "item_1", code: "SKU-1", name: "Rice", unit: "bag" };
    const item2 = { id: "item_2", code: "SKU-2", name: "Oil", unit: "L" };
    const state = baseState({
      items: [item1, item2],
      inventoryBalances: [
        { itemId: item1.id, quantity: "10", unit: "bag", unitCost: 0n, totalValue: 0n, warehouse: null },
        { itemId: item2.id, quantity: "0", unit: "L", unitCost: 500n, totalValue: 500n, warehouse: null },
      ],
    });
    const warnings = computeConsistencyWarnings(state);
    expect(warnings.some((w) => w.code === `inventory_qty_no_value:${item1.id}`)).toBe(true);
    expect(warnings.some((w) => w.code === `inventory_value_no_qty:${item2.id}`)).toBe(true);
  });

  it("flags a negative customer balance and a supplier debit balance", () => {
    const state = baseState({
      customers: [party({ id: "cust_1", name: "Alice", type: "customer" })],
      suppliers: [party({ id: "sup_1", name: "Bob", type: "supplier" })],
      customerBalances: [{ partyId: "cust_1", amount: -5000n }],
      supplierBalances: [{ partyId: "sup_1", amount: -3000n }],
    });
    const warnings = computeConsistencyWarnings(state);
    expect(warnings.some((w) => w.code === "negative_customer_balance:cust_1")).toBe(true);
    expect(warnings.some((w) => w.code === "supplier_debit_balance:sup_1")).toBe(true);
  });

  it("reuses the shared fuzzy matcher to flag duplicate customer and supplier names", () => {
    const state = baseState({
      customers: [
        party({ id: "cust_1", name: "Élhaji Adoúm", type: "customer" }),
        party({ id: "cust_2", name: "elhaji adoum", type: "customer" }), // accent/case-insensitive duplicate
        party({ id: "cust_3", name: "Zenith Global Traders", type: "customer" }), // unrelated
      ],
      suppliers: [
        party({ id: "sup_1", name: "Épicerie du Marché", type: "supplier" }),
        party({ id: "sup_2", name: "Epicerie du Marche", type: "supplier" }), // accent-insensitive duplicate
      ],
    });
    const warnings = computeConsistencyWarnings(state);
    expect(warnings.some((w) => w.title === "Possible duplicate customer")).toBe(true);
    expect(warnings.some((w) => w.title === "Possible duplicate supplier")).toBe(true);
    // The unrelated customer should not be paired with anything.
    expect(warnings.filter((w) => w.code.includes("cust_3")).length).toBe(0);
  });

  it("flags duplicate chart-of-account codes case-insensitively", () => {
    const a = account({ id: "acc_1", code: "1010", name: "Cash", subtype: "cash", type: "ASSET" });
    const b = account({ id: "acc_2", code: "1010", name: "Petty cash", subtype: "cash", type: "ASSET" });
    const state = baseState({ accounts: [a, b] });
    const warnings = computeConsistencyWarnings(state);
    expect(warnings.some((w) => w.title === "Duplicate chart-of-account code")).toBe(true);
  });

  it("flags a bank account missing a currency", () => {
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET", currency: null });
    const state = baseState({ accounts: [bank], bankBalances: [{ accountId: bank.id, amount: 1000n }] });
    const warnings = computeConsistencyWarnings(state);
    expect(warnings.some((w) => w.code === `bank_no_currency:${bank.id}`)).toBe(true);
  });

  it("flags a receivable/payable control account with zero customer/supplier assignments when parties exist", () => {
    const state = baseState({
      customers: [party({ id: "cust_1", name: "Alice", type: "customer" })],
      suppliers: [party({ id: "sup_1", name: "Bob", type: "supplier" })],
    });
    const warnings = computeConsistencyWarnings(state);
    expect(warnings.some((w) => w.code === "receivable_zero_assignments")).toBe(true);
    expect(warnings.some((w) => w.code === "payable_zero_assignments")).toBe(true);
  });

  it("does NOT flag zero assignments when the org has no customers/suppliers at all", () => {
    const warnings = computeConsistencyWarnings(baseState());
    expect(warnings.some((w) => w.code === "receivable_zero_assignments")).toBe(false);
    expect(warnings.some((w) => w.code === "payable_zero_assignments")).toBe(false);
  });

  it("flags unusually large opening equity relative to total staged assets (> 20% heuristic)", () => {
    const openingEquity = account({ id: "acc_oe", subtype: "opening_equity", type: "EQUITY" });
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET" });
    const state = baseState({
      accounts: [openingEquity, bank],
      bankBalances: [{ accountId: bank.id, amount: 100_000n }],
      openingBalances: [{ accountId: openingEquity.id, amount: 50_000n }], // 50% of assets
    });
    const warnings = computeConsistencyWarnings(state);
    expect(warnings.some((w) => w.code === "large_opening_equity")).toBe(true);
  });

  it("does not flag opening equity under the 20% threshold", () => {
    const openingEquity = account({ id: "acc_oe", subtype: "opening_equity", type: "EQUITY" });
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET" });
    const state = baseState({
      accounts: [openingEquity, bank],
      bankBalances: [{ accountId: bank.id, amount: 100_000n }],
      openingBalances: [{ accountId: openingEquity.id, amount: 10_000n }], // 10% of assets
    });
    const warnings = computeConsistencyWarnings(state);
    expect(warnings.some((w) => w.code === "large_opening_equity")).toBe(false);
  });

  it("tracks acknowledgements so a dismissed warning stops appearing as outstanding", () => {
    const item = { id: "item_1", code: "SKU-1", name: "Rice", unit: "bag" };
    const state = baseState({
      items: [item],
      inventoryBalances: [{ itemId: item.id, quantity: "-1", unit: "bag", unitCost: 0n, totalValue: 0n, warehouse: null }],
    });
    const before = computeConsistencyWarnings(state);
    const code = before.find((w) => w.code.startsWith("negative_inventory"))!.code;
    expect(before.find((w) => w.code === code)?.acknowledged).toBe(false);

    const acked = { ...state, acknowledgedWarnings: [code] };
    const after = computeConsistencyWarnings(acked);
    expect(after.find((w) => w.code === code)?.acknowledged).toBe(true);
    expect(unacknowledgedWarnings(acked).some((w) => w.code === code)).toBe(false);
  });
});

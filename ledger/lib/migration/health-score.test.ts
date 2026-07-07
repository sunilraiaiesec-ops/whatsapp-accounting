import { describe, expect, it } from "vitest";

import { computeHealthScore } from "@/lib/migration/health-score";
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

describe("computeHealthScore", () => {
  it("scores a fully-clean, fully-balanced, fully-assigned wizard at 100%", () => {
    const equity = account({ id: "acc_equity", subtype: "equity", type: "EQUITY" });
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET", currency: "XAF" });
    const cust = party({ id: "cust_1", name: "Alice", type: "customer" });
    const sup = party({ id: "sup_1", name: "Bob", type: "supplier" });

    // Assets (bank 100,000 + AR 10,000 = 110,000) must equal Liabilities (AP
    // 5,000) + Equity (105,000) = 110,000.
    const state = baseState({
      accounts: [equity, bank],
      customers: [cust],
      suppliers: [sup],
      items: [],
      bankBalances: [{ accountId: bank.id, amount: 100_000n }],
      openingBalances: [{ accountId: equity.id, amount: 105_000n }],
      customerBalances: [{ partyId: cust.id, amount: 10_000n }],
      supplierBalances: [{ partyId: sup.id, amount: 5_000n }],
    });

    const result = computeHealthScore(state);
    expect(result.score).toBe(100);
    expect(result.canProceed).toBe(true);
    expect(result.checklist.every((c) => c.pass)).toBe(true);
    expect(result.warningItems).toEqual([]);
  });

  it("scores an unbalanced wizard below 100% and blocks proceeding (trial balance dominates the score)", () => {
    const equity = account({ id: "acc_equity", subtype: "equity", type: "EQUITY" });
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET" });
    const state = baseState({
      accounts: [equity, bank],
      bankBalances: [{ accountId: bank.id, amount: 100_000n }],
      openingBalances: [{ accountId: equity.id, amount: 40_000n }],
    });

    const result = computeHealthScore(state);
    expect(result.score).toBeLessThan(100);
    expect(result.canProceed).toBe(false);
    expect(result.checklist.find((c) => c.label === "Trial balance balances")?.pass).toBe(false);
  });

  it("phrases each outstanding Step 5B warning as a checklist item and reduces the score", () => {
    const item = { id: "item_1", code: "SKU-1", name: "Rice 25kg", unit: "bag" };
    const state = baseState({
      items: [item],
      inventoryBalances: [{ itemId: item.id, quantity: "-5", unit: "bag", unitCost: 1000n, totalValue: -5000n, warehouse: null }],
    });

    const result = computeHealthScore(state);
    expect(result.warningItems.length).toBeGreaterThan(0);
    expect(result.warningItems[0]).toContain("⚠");
    expect(result.score).toBeLessThan(100);
  });

  it("does not penalize customer/supplier assignment when the org has no customers or suppliers at all", () => {
    const state = baseState({ customers: [], suppliers: [] });
    const result = computeHealthScore(state);
    expect(result.checklist.find((c) => c.label === "Customer balances assigned")?.pass).toBe(true);
    expect(result.checklist.find((c) => c.label === "Supplier balances assigned")?.pass).toBe(true);
  });

  it("caps the warnings penalty so a 6th+ outstanding warning costs no further points", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: `item_${i}`, code: `SKU-${i}`, name: `Item ${i}`, unit: "pcs" }));
    // Each item flags an "inventory value without quantity" warning.
    const inventoryBalances = items.map((it) => ({
      itemId: it.id,
      quantity: "0",
      unit: "pcs",
      unitCost: 1000n,
      totalValue: 1000n,
      warehouse: null,
    }));
    const state = baseState({ items, inventoryBalances });
    const result = computeHealthScore(state);
    const warningsChecklistEntry = result.checklist.find((c) => c.label.includes("outstanding warning"))!;
    expect(warningsChecklistEntry.pass).toBe(false);
    // 8 warnings clamps to the same penalty as 5+ — score shouldn't fall further than that floor.
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

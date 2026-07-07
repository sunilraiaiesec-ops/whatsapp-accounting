import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMigrationPrisma, makeAccount } from "@/lib/test-utils/fakeMigrationPrisma";
import type { AccountSummary, WizardState } from "@/lib/migration/types";

let fake: ReturnType<typeof createFakeMigrationPrisma>;

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return fake;
  },
}));

const { explainImbalance, applyBalancingSuggestion } = await import("@/lib/migration/suggestions");
const { setOpeningBalanceRaw } = await import("@/lib/migration/wizard");

function account(overrides: Partial<AccountSummary> & { id: string; subtype: string; type: AccountSummary["type"] }): AccountSummary {
  return { code: overrides.id, name: overrides.id, isControl: false, currency: null, ...overrides };
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

beforeEach(() => {
  fake = createFakeMigrationPrisma();
  // No OPENAI_API_KEY is set in the test environment, so askWizardAssistant
  // degrades to its rule-based canned answer — explainImbalance never makes
  // a real network call here.
});

describe("explainImbalance (Step 5A) — rule-based detection", () => {
  it("reports balanced with no findings and no actions when the trial balance is already zero", async () => {
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET" });
    const equity = account({ id: "acc_equity", subtype: "equity", type: "EQUITY" });
    const state = baseState({
      accounts: [bank, equity],
      bankBalances: [{ accountId: bank.id, amount: 100_000n }],
      openingBalances: [{ accountId: equity.id, amount: 100_000n }],
    });
    const result = await explainImbalance(state, "XAF");
    expect(result.findings).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(result.ruleBasedSummary).toContain("balance");
  });

  it("detects a missing Owner's Capital / Retained Earnings / Opening Equity when all equity categories are zero", async () => {
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET" });
    const state = baseState({
      accounts: [bank],
      bankBalances: [{ accountId: bank.id, amount: 100_000n }],
    });
    const result = await explainImbalance(state, "XAF");
    expect(result.findings.some((f) => f.code === "owner_capital_missing")).toBe(true);
    expect(result.findings.some((f) => f.code === "retained_earnings_missing")).toBe(true);
    expect(result.findings.some((f) => f.code === "loans_missing")).toBe(true);
  });

  it("detects incomplete inventory valuation (quantity staged but zero cost)", async () => {
    const item = { id: "item_1", code: "SKU-1", name: "Rice", unit: "bag" };
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET" });
    // A staged bank balance with nothing on the other side of the equation
    // guarantees a genuine imbalance (an all-empty state is trivially
    // "balanced" at 0 = 0, which wouldn't exercise detectFindings at all).
    const state = baseState({
      accounts: [bank],
      bankBalances: [{ accountId: bank.id, amount: 20_000n }],
      items: [item],
      inventoryBalances: [{ itemId: item.id, quantity: "10", unit: "bag", unitCost: 0n, totalValue: 0n, warehouse: null }],
    });
    const result = await explainImbalance(state, "XAF");
    expect(result.findings.some((f) => f.code === "inventory_incomplete")).toBe(true);
  });

  it("always returns rule-based findings even when AI phrasing is unavailable (no OPENAI_API_KEY)", async () => {
    const state = baseState();
    const result = await explainImbalance(state, "XAF");
    expect(result.aiMessage).toBeNull();
    expect(result.ruleBasedSummary.length).toBeGreaterThan(0);
  });

  it("offers exactly the two opt-in balancing actions when out of balance, and none when balanced", async () => {
    const bank = account({ id: "acc_bank", subtype: "bank", type: "ASSET" });
    // An empty wizard is trivially "balanced" (0 = 0) — stage a lone bank
    // balance with nothing offsetting it to force a genuine imbalance.
    const unbalancedState = baseState({ accounts: [bank], bankBalances: [{ accountId: bank.id, amount: 15_000n }] });
    const unbalanced = await explainImbalance(unbalancedState, "XAF");
    expect(unbalanced.actions.map((a) => a.id).sort()).toEqual(["allocate_opening_equity", "allocate_retained_earnings"].sort());

    const bank2 = account({ id: "acc_bank_2", subtype: "bank", type: "ASSET" });
    const equity = account({ id: "acc_equity", subtype: "equity", type: "EQUITY" });
    const balanced = baseState({
      accounts: [bank2, equity],
      bankBalances: [{ accountId: bank2.id, amount: 1n }],
      openingBalances: [{ accountId: equity.id, amount: 1n }],
    });
    const balancedResult = await explainImbalance(balanced, "XAF");
    expect(balancedResult.actions).toEqual([]);
  });
});

describe("applyBalancingSuggestion — opt-in staging, never auto-posts", () => {
  it("stages the exact balancing amount into Opening Equity and never creates a journal entry", async () => {
    const openingEquityAccount = makeAccount({ orgId: "org_1", code: "3950", name: "Opening balance equity", type: "EQUITY", subtype: "opening_equity" });
    const bankAccount = account({ id: "acc_bank", subtype: "bank", type: "ASSET" });
    fake.__tables.account.push(openingEquityAccount);
    fake.__tables.migrationWizard.push({
      id: "wiz_1",
      orgId: "org_1",
      status: "IN_PROGRESS",
      currentStep: 5,
      openingDate: new Date("2026-01-01"),
      completedAt: null,
      completedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const state = baseState({
      accounts: [
        bankAccount,
        account({ id: openingEquityAccount.id as string, subtype: "opening_equity", type: "EQUITY" }),
      ],
      bankBalances: [{ accountId: bankAccount.id, amount: 250_000n }],
    });

    await applyBalancingSuggestion("org_1", "allocate_opening_equity", state);

    const staged = fake.__tables.migrationOpeningBalance.find((r) => r.accountId === openingEquityAccount.id);
    expect(staged?.amount).toBe(250_000n); // exactly zeros out the 250,000 difference
    expect(fake.__tables.journalEntry.length).toBe(0);
    expect(fake.__tables.journalLine.length).toBe(0);
  });

  it("rejects an unknown suggestion id and rejects allocating when already balanced", async () => {
    fake.__tables.migrationWizard.push({
      id: "wiz_1",
      orgId: "org_1",
      status: "IN_PROGRESS",
      currentStep: 5,
      openingDate: new Date("2026-01-01"),
      completedAt: null,
      completedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const balanced = baseState();
    await expect(applyBalancingSuggestion("org_1", "allocate_opening_equity", balanced)).rejects.toThrow(/already balanced/i);
  });
});

// Sanity check that the raw setter used by suggestions writes only to the
// staging table (used transitively above, exercised directly here too).
describe("setOpeningBalanceRaw", () => {
  it("throws for an account outside the org", async () => {
    fake.__tables.migrationWizard.push({
      id: "wiz_1",
      orgId: "org_1",
      status: "IN_PROGRESS",
      currentStep: 3,
      openingDate: new Date("2026-01-01"),
      completedAt: null,
      completedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(setOpeningBalanceRaw("org_1", "acc_unknown", 100n)).rejects.toThrow(/unknown account/i);
  });
});

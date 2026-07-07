import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMigrationPrisma, makeAccount, makeInventoryItem } from "@/lib/test-utils/fakeMigrationPrisma";
import type { AccountSummary, WizardState } from "@/lib/migration/types";

let fake: ReturnType<typeof createFakeMigrationPrisma>;

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return fake;
  },
}));

const { finishMigration, FinishBlockedError } = await import("@/lib/migration/finish");

function toSummary(row: Record<string, unknown>): AccountSummary {
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    type: row.type as AccountSummary["type"],
    subtype: row.subtype as string | null,
    isControl: (row.isControl as boolean) ?? false,
    currency: (row.currency as string | null) ?? null,
  };
}

function balancedState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    wizard: { id: "wiz_1", orgId: "org_1", status: "in_progress", currentStep: 7, openingDate: "2026-01-01", completedAt: null, completedById: null },
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
});

describe("finishMigration — permissions", () => {
  it("blocks a non-administrator, even with a fully balanced wizard", async () => {
    const equity = makeAccount({ orgId: "org_1", code: "3000", name: "Owner's equity", type: "EQUITY", subtype: "equity" });
    const bank = makeAccount({ orgId: "org_1", code: "1010", name: "Bank", type: "ASSET", subtype: "bank" });
    fake.__tables.account.push(equity, bank);
    fake.__tables.migrationWizard.push({
      id: "wiz_1",
      orgId: "org_1",
      status: "IN_PROGRESS",
      currentStep: 7,
      openingDate: new Date("2026-01-01"),
      completedAt: null,
      completedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const state = balancedState({
      accounts: [toSummary(equity), toSummary(bank)],
      bankBalances: [{ accountId: bank.id as string, amount: 100_000n }],
      openingBalances: [{ accountId: equity.id as string, amount: 100_000n }],
    });

    await expect(finishMigration("org_1", "user_staff", false, state)).rejects.toBeInstanceOf(FinishBlockedError);
    // Viewing/computing was allowed (no throw before the permission check),
    // but nothing should have been posted.
    expect(fake.__tables.journalEntry.length).toBe(0);
  });

  it("allows an administrator to finish a fully balanced, fully acknowledged wizard", async () => {
    const equity = makeAccount({ orgId: "org_1", code: "3000", name: "Owner's equity", type: "EQUITY", subtype: "equity" });
    const bank = makeAccount({ orgId: "org_1", code: "1010", name: "Bank", type: "ASSET", subtype: "bank", currency: "XAF" });
    fake.__tables.account.push(equity, bank);
    fake.__tables.migrationWizard.push({
      id: "wiz_1",
      orgId: "org_1",
      status: "IN_PROGRESS",
      currentStep: 7,
      openingDate: new Date("2026-01-01"),
      completedAt: null,
      completedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const state = balancedState({
      accounts: [toSummary(equity), toSummary(bank)],
      bankBalances: [{ accountId: bank.id as string, amount: 100_000n }],
      openingBalances: [{ accountId: equity.id as string, amount: 100_000n }],
    });

    const result = await finishMigration("org_1", "user_owner", true, state);
    expect(result.journalEntryId).not.toBeNull();

    const entry = fake.__tables.journalEntry.find((e) => e.id === result.journalEntryId)!;
    expect(entry.sourceType).toBe("migration_opening_balance");
    const lines = fake.__tables.journalLine.filter((l) => l.journalEntryId === entry.id);
    expect(lines.length).toBe(2);
    const totalDebit = lines.reduce((s, l) => s + (l.debit as bigint), 0n);
    const totalCredit = lines.reduce((s, l) => s + (l.credit as bigint), 0n);
    expect(totalDebit).toBe(totalCredit);

    const wizardRow = fake.__tables.migrationWizard.find((w) => w.id === "wiz_1")!;
    expect(wizardRow.status).toBe("COMPLETED");
    expect(wizardRow.completedById).toBe("user_owner");
    expect(wizardRow.completedAt).not.toBeNull();
  });

  it("blocks finishing a wizard that is already completed", async () => {
    const state = balancedState({ wizard: { ...balancedState().wizard, status: "completed" } });
    await expect(finishMigration("org_1", "user_owner", true, state)).rejects.toBeInstanceOf(FinishBlockedError);
  });

  it("blocks finishing while the trial balance is unbalanced", async () => {
    const bank = makeAccount({ orgId: "org_1", code: "1010", name: "Bank", type: "ASSET", subtype: "bank" });
    fake.__tables.account.push(bank);
    const state = balancedState({
      accounts: [toSummary(bank)],
      bankBalances: [{ accountId: bank.id as string, amount: 50_000n }], // nothing on the other side
    });
    await expect(finishMigration("org_1", "user_owner", true, state)).rejects.toThrow(/not zero/i);
  });

  it("blocks finishing while there are unacknowledged Step 5B warnings", async () => {
    const equity = makeAccount({ orgId: "org_1", code: "3000", name: "Owner's equity", type: "EQUITY", subtype: "equity" });
    const bank = makeAccount({ orgId: "org_1", code: "1010", name: "Bank", type: "ASSET", subtype: "bank", currency: null });
    fake.__tables.account.push(equity, bank);
    const state = balancedState({
      accounts: [toSummary(equity), toSummary(bank)],
      bankBalances: [{ accountId: bank.id as string, amount: 100_000n }], // bank with no currency → unacknowledged warning
      openingBalances: [{ accountId: equity.id as string, amount: 100_000n }],
    });
    await expect(finishMigration("org_1", "user_owner", true, state)).rejects.toThrow(/outstanding warning/i);
  });
});

describe("finishMigration — atomic transaction / rollback", () => {
  it("rolls back the ENTIRE transaction (no journal entry, no inventory update, wizard stays incomplete) if a mid-transaction step throws", async () => {
    const equity = makeAccount({ orgId: "org_1", code: "3000", name: "Owner's equity", type: "EQUITY", subtype: "equity" });
    const bank = makeAccount({ orgId: "org_1", code: "1010", name: "Bank", type: "ASSET", subtype: "bank", currency: "XAF" });
    const inventoryControl = makeAccount({ orgId: "org_1", code: "1300", name: "Inventory", type: "ASSET", subtype: "inventory", isControl: true });
    const item = makeInventoryItem({ orgId: "org_1", code: "SKU-1", name: "Rice 25kg" });
    fake.__tables.account.push(equity, bank, inventoryControl);
    fake.__tables.inventoryItem.push(item);
    fake.__tables.migrationWizard.push({
      id: "wiz_1",
      orgId: "org_1",
      status: "IN_PROGRESS",
      currentStep: 7,
      openingDate: new Date("2026-01-01"),
      completedAt: null,
      completedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Assets (bank 100,000 + inventory 5,000 = 105,000) balanced against
    // Equity (105,000).
    const state = balancedState({
      accounts: [toSummary(equity), toSummary(bank), toSummary(inventoryControl)],
      bankBalances: [{ accountId: bank.id as string, amount: 100_000n }],
      openingBalances: [{ accountId: equity.id as string, amount: 105_000n }],
      items: [{ id: item.id as string, code: item.code as string, name: item.name as string, unit: null }],
      inventoryBalances: [{ itemId: item.id as string, quantity: "5", unit: "bag", unitCost: 1000n, totalValue: 5000n, warehouse: null }],
    });

    // Simulate a mid-transaction failure: the inventory item is removed out
    // from under the transaction (e.g. deleted concurrently) after the
    // journal-entry step would already have run, so the tx's own
    // `inventoryItem.update` throws naturally — a realistic failure that
    // happens strictly inside the transaction, not a monkey-patched one
    // (a mocked method on `fake` wouldn't be seen by the fresh `tx` client
    // finishMigration's `$transaction` builds internally for rollback
    // isolation).
    fake.__tables.inventoryItem.splice(0, fake.__tables.inventoryItem.length);

    await expect(finishMigration("org_1", "user_owner", true, state)).rejects.toThrow(/not found/i);

    // Nothing should have been committed: no journal entry/lines, and the
    // wizard is still not marked completed.
    expect(fake.__tables.journalEntry.length).toBe(0);
    expect(fake.__tables.journalLine.length).toBe(0);
    const wizardRow = fake.__tables.migrationWizard.find((w) => w.id === "wiz_1")!;
    expect(wizardRow.status).toBe("IN_PROGRESS");
    expect(wizardRow.completedAt).toBeNull();
  });

  it("on success, commits the journal entry AND the inventory quantity/value update together", async () => {
    const equity = makeAccount({ orgId: "org_1", code: "3000", name: "Owner's equity", type: "EQUITY", subtype: "equity" });
    const inventoryControl = makeAccount({ orgId: "org_1", code: "1300", name: "Inventory", type: "ASSET", subtype: "inventory", isControl: true });
    const item = makeInventoryItem({ orgId: "org_1", code: "SKU-1", name: "Rice 25kg" });
    fake.__tables.account.push(equity, inventoryControl);
    fake.__tables.inventoryItem.push(item);
    fake.__tables.migrationWizard.push({
      id: "wiz_1",
      orgId: "org_1",
      status: "IN_PROGRESS",
      currentStep: 7,
      openingDate: new Date("2026-01-01"),
      completedAt: null,
      completedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const state = balancedState({
      accounts: [toSummary(equity), toSummary(inventoryControl)],
      openingBalances: [{ accountId: equity.id as string, amount: 5000n }],
      items: [{ id: item.id as string, code: item.code as string, name: item.name as string, unit: null }],
      inventoryBalances: [{ itemId: item.id as string, quantity: "5", unit: "bag", unitCost: 1000n, totalValue: 5000n, warehouse: null }],
    });

    const result = await finishMigration("org_1", "user_owner", true, state);
    expect(result.inventoryItemsUpdated).toBe(1);

    const itemRow = fake.__tables.inventoryItem.find((r) => r.id === item.id)!;
    expect(itemRow.qtyOnHand).toBe(5);
    expect(itemRow.valueOnHand).toBe(5000n);
  });
});

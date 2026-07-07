import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMigrationPrisma, makeAccount, makeParty, makeInventoryItem } from "@/lib/test-utils/fakeMigrationPrisma";

let fake: ReturnType<typeof createFakeMigrationPrisma>;

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return fake;
  },
}));

const {
  isAdminRole,
  computeInventoryLine,
  getOrCreateWizard,
  loadWizardState,
  toClientState,
  setCurrentStep,
  setOpeningDate,
  upsertOpeningBalance,
  upsertCustomerBalance,
  upsertSupplierBalance,
  upsertInventoryBalance,
  removeInventoryBalance,
  acknowledgeWarning,
  unacknowledgeWarning,
  MigrationError,
} = await import("@/lib/migration/wizard");

beforeEach(() => {
  fake = createFakeMigrationPrisma();
});

describe("isAdminRole", () => {
  it("treats OWNER and ADMIN as administrators, and STAFF/MEMBER as not", () => {
    expect(isAdminRole("OWNER")).toBe(true);
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("STAFF")).toBe(false);
    expect(isAdminRole("MEMBER")).toBe(false);
  });
});

describe("computeInventoryLine", () => {
  it("computes total value as quantity * unit cost in minor units", () => {
    const { quantity, unitCost, totalValue } = computeInventoryLine("12", "5000", "XAF");
    expect(quantity.toString()).toBe("12");
    expect(unitCost).toBe(5000n);
    expect(totalValue).toBe(60_000n);
  });

  it("handles fractional quantities", () => {
    const { totalValue } = computeInventoryLine("2.5", "1000", "XAF");
    expect(totalValue).toBe(2500n);
  });

  it("treats a blank quantity or cost as zero", () => {
    const { quantity, unitCost, totalValue } = computeInventoryLine("", "", "XAF");
    expect(quantity.toString()).toBe("0");
    expect(unitCost).toBe(0n);
    expect(totalValue).toBe(0n);
  });
});

describe("getOrCreateWizard", () => {
  it("is idempotent — creates once, returns the same row on subsequent calls", async () => {
    const first = await getOrCreateWizard("org_1");
    const second = await getOrCreateWizard("org_1");
    expect(first.id).toBe(second.id);
    expect(fake.__tables.migrationWizard.filter((w) => w.orgId === "org_1").length).toBe(1);
  });
});

describe("save & resume", () => {
  it("persists staged data and resumes at the saved currentStep on reload", async () => {
    const bank = makeAccount({ orgId: "org_1", code: "1010", name: "Main Bank", type: "ASSET", subtype: "bank", currency: "XAF" });
    const cust = makeParty({ orgId: "org_1", name: "Alice", type: "customer" });
    fake.__tables.account.push(bank);
    fake.__tables.party.push(cust);

    await setOpeningDate("org_1", "2026-01-01");
    await setCurrentStep("org_1", 4);
    await upsertCustomerBalance("org_1", cust.id as string, "125,000", "XAF");

    // Simulate reopening the wizard later (fresh `loadWizardState` call).
    const resumed = await loadWizardState("org_1");
    expect(resumed.wizard.currentStep).toBe(4);
    expect(resumed.wizard.openingDate).toBe("2026-01-01");
    expect(resumed.customerBalances.find((r) => r.partyId === cust.id)?.amount).toBe(125_000n);

    const client = toClientState(resumed, "XAF", true);
    expect(client.customerBalances.find((r) => r.partyId === cust.id)?.amount).toBe("125,000");
  });

  it("blocks edits to a wizard that has already been completed", async () => {
    const wizard = await getOrCreateWizard("org_1");
    const row = fake.__tables.migrationWizard.find((w) => w.id === wizard.id)!;
    row.status = "COMPLETED";

    await expect(setOpeningDate("org_1", "2026-02-01")).rejects.toThrow(MigrationError);
  });
});

describe("upsertOpeningBalance / upsertSupplierBalance / upsertInventoryBalance", () => {
  it("upserts (update-in-place, not duplicate) when called twice for the same account", async () => {
    const equity = makeAccount({ orgId: "org_1", code: "3000", name: "Owner's equity", type: "EQUITY", subtype: "equity" });
    fake.__tables.account.push(equity);

    await upsertOpeningBalance("org_1", equity.id as string, "100,000", "XAF");
    await upsertOpeningBalance("org_1", equity.id as string, "150,000", "XAF");

    const rows = fake.__tables.migrationOpeningBalance.filter((r) => r.accountId === equity.id);
    expect(rows.length).toBe(1);
    expect(rows[0].amount).toBe(150_000n);
  });

  it("rejects a supplier balance for a party outside the org", async () => {
    await expect(upsertSupplierBalance("org_1", "party_from_other_org", "1000", "XAF")).rejects.toThrow(MigrationError);
  });

  it("stages inventory quantity/unit/cost/warehouse and computes totalValue, then supports clearing it", async () => {
    const item = makeInventoryItem({ orgId: "org_1", code: "SKU-1", name: "Rice 25kg" });
    fake.__tables.inventoryItem.push(item);

    const row = await upsertInventoryBalance(
      "org_1",
      item.id as string,
      { quantity: "20", unit: "bag", unitCost: "3,500", warehouse: "Main store" },
      "XAF",
    );
    expect(row.quantity).toBe("20");
    expect(row.totalValue).toBe(70_000n);
    expect(row.warehouse).toBe("Main store");

    await removeInventoryBalance("org_1", item.id as string);
    const remaining = fake.__tables.migrationInventoryBalance.filter((r) => r.itemId === item.id);
    expect(remaining.length).toBe(0);
  });
});

describe("acknowledgeWarning / unacknowledgeWarning", () => {
  it("is idempotent and reversible", async () => {
    await acknowledgeWarning("org_1", "large_opening_equity");
    await acknowledgeWarning("org_1", "large_opening_equity"); // second ack shouldn't duplicate
    expect(fake.__tables.migrationAcknowledgedWarning.filter((r) => r.code === "large_opening_equity").length).toBe(1);

    await unacknowledgeWarning("org_1", "large_opening_equity");
    expect(fake.__tables.migrationAcknowledgedWarning.filter((r) => r.code === "large_opening_equity").length).toBe(0);
  });
});

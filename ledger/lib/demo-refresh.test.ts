import { describe, expect, it, vi, beforeEach } from "vitest";

const salesInvoiceFindMany = vi.fn();
const salesInvoiceUpdate = vi.fn();
const salesInvoiceCount = vi.fn();
const inventoryItemFindMany = vi.fn();
const inventoryItemUpdate = vi.fn();
const membershipFindFirst = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesInvoice: {
      findMany: (...args: unknown[]) => salesInvoiceFindMany(...args),
      update: (...args: unknown[]) => salesInvoiceUpdate(...args),
      count: (...args: unknown[]) => salesInvoiceCount(...args),
    },
    inventoryItem: {
      findMany: (...args: unknown[]) => inventoryItemFindMany(...args),
      update: (...args: unknown[]) => inventoryItemUpdate(...args),
    },
    membership: {
      findFirst: (...args: unknown[]) => membershipFindFirst(...args),
    },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: vi.fn(),
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

vi.mock("@/lib/billing/reminders", () => ({
  getPaymentReminderCount: vi.fn(),
  getDueSoonAndOverdueInvoices: vi.fn(),
}));

vi.mock("@/lib/reorder", () => ({
  countLowStockItems: vi.fn(),
}));

const { getPaymentReminderCount, getDueSoonAndOverdueInvoices } = await import("@/lib/billing/reminders");
const { countLowStockItems } = await import("@/lib/reorder");
const {
  addDays,
  demoOrgSeed,
  needsDemoRefresh,
  refreshDemoAccountData,
  maybeRefreshDemoAccount,
  resetDemoRefreshCooldown,
  startOfUtcDay,
} = await import("@/lib/demo-refresh");
const { isDemoAccountEmail } = await import("@/lib/demo-accounts");

const DEMO_ORG = "cldemo123centralorgid";
const NOW = new Date("2026-07-08T15:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  resetDemoRefreshCooldown();
  // Production memberships use role OWNER — guard matches on demo email, not role string.
  membershipFindFirst.mockResolvedValue({ id: "membership_demo" });
  // Default: no outstanding invoices to settle — tests that care override this.
  salesInvoiceFindMany.mockResolvedValue([]);
});

describe("demo-accounts guards", () => {
  it("recognises the three demo emails", () => {
    expect(isDemoAccountEmail("central.demo@bantoobooks.com")).toBe(true);
    expect(isDemoAccountEmail("atlantic.demo@bantoobooks.com")).toBe(true);
    expect(isDemoAccountEmail("prime.demo@bantoobooks.com")).toBe(true);
    expect(isDemoAccountEmail("real.customer@example.com")).toBe(false);
  });
});

describe("date helpers", () => {
  it("addDays shifts on UTC calendar boundaries", () => {
    const today = startOfUtcDay(NOW);
    expect(addDays(today, 7).toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(addDays(today, -3).toISOString().slice(0, 10)).toBe("2026-07-05");
  });
});

describe("needsDemoRefresh", () => {
  it("returns true when there are any payment reminders", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(1);
    vi.mocked(countLowStockItems).mockResolvedValue(0);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-07") }]);

    expect(await needsDemoRefresh(DEMO_ORG, NOW)).toBe(true);
  });

  it("returns true when there are any low-stock items", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(0);
    vi.mocked(countLowStockItems).mockResolvedValue(1);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-07") }]);

    expect(await needsDemoRefresh(DEMO_ORG, NOW)).toBe(true);
  });

  it("returns true when activity is more than 2 days behind", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(0);
    vi.mocked(countLowStockItems).mockResolvedValue(0);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-01") }]);

    expect(await needsDemoRefresh(DEMO_ORG, NOW)).toBe(true);
  });

  it("returns false when the dashboard already looks healthy", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(0);
    vi.mocked(countLowStockItems).mockResolvedValue(0);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-08") }]);

    expect(await needsDemoRefresh(DEMO_ORG, NOW)).toBe(false);
  });
});

describe("refreshDemoAccountData", () => {
  it("is a no-op for non-demo orgs", async () => {
    membershipFindFirst.mockResolvedValue(null);
    const result = await refreshDemoAccountData("real-org", NOW);
    expect(result).toBeNull();
    expect(salesInvoiceFindMany).not.toHaveBeenCalled();
    expect(salesInvoiceUpdate).not.toHaveBeenCalled();
  });

  it("force refresh bypasses the demo-org guard", async () => {
    membershipFindFirst.mockResolvedValue(null);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-08") }]);
    inventoryItemFindMany.mockResolvedValue([]);
    vi.mocked(countLowStockItems).mockResolvedValue(0);

    const result = await refreshDemoAccountData("any-org", NOW, { force: true });
    expect(result).not.toBeNull();
    expect(salesInvoiceFindMany).toHaveBeenCalled();
  });

  it("settles every unpaid invoice and leaves zero reminders", async () => {
    queryRaw.mockResolvedValue([{ max_date: new Date("2025-02-01") }]);
    salesInvoiceFindMany.mockResolvedValue([
      { id: "inv_1", total: 668_000n },
      { id: "inv_2", total: 12_000n },
    ]);
    inventoryItemFindMany.mockResolvedValue([
      {
        id: "item_1",
        qtyOnHand: "100",
        valueOnHand: 1_000_000n,
        reorderLevel: new (await import("@prisma/client")).Prisma.Decimal(40),
      },
    ]);
    vi.mocked(countLowStockItems).mockResolvedValue(0);

    const result = await refreshDemoAccountData(DEMO_ORG, NOW);

    expect(result).not.toBeNull();
    expect(salesInvoiceFindMany).toHaveBeenCalledWith({
      where: { orgId: DEMO_ORG, status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      select: { id: true, total: true },
    });
    // Each row is settled individually so its own total becomes amountPaid
    // (PAID implies amountPaid >= total — a blind updateMany can't do this).
    expect(salesInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: { status: "PAID", amountPaid: 668_000n },
    });
    expect(salesInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: "inv_2" },
      data: { status: "PAID", amountPaid: 12_000n },
    });
    expect(result!.unpaidInvoices).toBe(0);
    expect(result!.overdueInvoices).toBe(0);
    expect(result!.dueSoonInvoices).toBe(0);
    expect(result!.shiftedDays).toBeGreaterThan(0);
  });

  it("restocks every item above its reorder level, leaving zero low-stock", async () => {
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-08") }]);
    inventoryItemFindMany.mockResolvedValue([
      {
        id: "item_1",
        qtyOnHand: "5",
        valueOnHand: 50_000n,
        reorderLevel: new (await import("@prisma/client")).Prisma.Decimal(40),
      },
    ]);
    vi.mocked(countLowStockItems).mockResolvedValue(0);

    const result = await refreshDemoAccountData(DEMO_ORG, NOW);

    expect(result).not.toBeNull();
    expect(inventoryItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "item_1" } }),
    );
    const [[updateCall]] = inventoryItemUpdate.mock.calls;
    expect(Number(updateCall.data.qtyOnHand)).toBeGreaterThan(40); // above reorder level
    expect(result!.lowStockItems).toBe(0);
  });
});

describe("maybeRefreshDemoAccount", () => {
  it("skips when data is fresh and cooldown has not expired", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(0);
    vi.mocked(countLowStockItems).mockResolvedValue(0);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-08") }]);
    inventoryItemFindMany.mockResolvedValue([]);

    await refreshDemoAccountData(DEMO_ORG, NOW);

    vi.mocked(getPaymentReminderCount).mockResolvedValue(0);
    vi.mocked(countLowStockItems).mockResolvedValue(0);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-08") }]);

    const result = await maybeRefreshDemoAccount(DEMO_ORG, NOW);
    expect(result).toBeNull();
  });

  it("refreshes stale data even inside the cooldown window", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(600);
    vi.mocked(countLowStockItems).mockResolvedValue(0);
    queryRaw.mockResolvedValue([{ max_date: new Date("2025-01-01") }]);
    inventoryItemFindMany.mockResolvedValue([]);

    await refreshDemoAccountData(DEMO_ORG, NOW);
    vi.mocked(getPaymentReminderCount).mockResolvedValue(600);

    const result = await maybeRefreshDemoAccount(DEMO_ORG, NOW);
    expect(result).not.toBeNull();
  });
});

describe("demoOrgSeed", () => {
  it("returns a stable positive integer", () => {
    expect(demoOrgSeed(DEMO_ORG)).toBe(demoOrgSeed(DEMO_ORG));
    expect(demoOrgSeed(DEMO_ORG)).toBeGreaterThan(0);
  });
});

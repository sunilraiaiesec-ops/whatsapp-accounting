import { describe, expect, it, vi, beforeEach } from "vitest";

const salesInvoiceFindMany = vi.fn();
const salesInvoiceUpdateMany = vi.fn();
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
      updateMany: (...args: unknown[]) => salesInvoiceUpdateMany(...args),
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
  buildReminderDueOffsets,
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

describe("buildReminderDueOffsets", () => {
  it("returns 6–8 offsets with 2–3 overdue and 1 due today", () => {
    const offsets = buildReminderDueOffsets(DEMO_ORG);
    expect(offsets.length).toBeGreaterThanOrEqual(6);
    expect(offsets.length).toBeLessThanOrEqual(8);
    expect(offsets.filter((d) => d < 0).length).toBeGreaterThanOrEqual(2);
    expect(offsets.filter((d) => d < 0).length).toBeLessThanOrEqual(3);
    expect(offsets.filter((d) => d === 0).length).toBe(1);
    expect(offsets.filter((d) => d > 0 && d <= 7).length).toBeGreaterThanOrEqual(2);
  });

  it("is stable for the same org", () => {
    expect(buildReminderDueOffsets(DEMO_ORG)).toEqual(buildReminderDueOffsets(DEMO_ORG));
    expect(buildReminderDueOffsets(DEMO_ORG)).not.toEqual(buildReminderDueOffsets("other-org-id"));
  });
});

describe("needsDemoRefresh", () => {
  it("returns true when reminder count is too high", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(679);
    vi.mocked(countLowStockItems).mockResolvedValue(4);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-07") }]);

    expect(await needsDemoRefresh(DEMO_ORG, NOW)).toBe(true);
  });

  it("returns true when activity is more than 2 days behind", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(5);
    vi.mocked(countLowStockItems).mockResolvedValue(4);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-01") }]);

    expect(await needsDemoRefresh(DEMO_ORG, NOW)).toBe(true);
  });

  it("returns false when the dashboard already looks healthy", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(6);
    vi.mocked(countLowStockItems).mockResolvedValue(4);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-08") }]);

    expect(await needsDemoRefresh(DEMO_ORG, NOW)).toBe(false);
  });
});

describe("refreshDemoAccountData", () => {
  it("is a no-op for non-demo orgs", async () => {
    membershipFindFirst.mockResolvedValue(null);
    const result = await refreshDemoAccountData("real-org", NOW);
    expect(result).toBeNull();
    expect(salesInvoiceUpdateMany).not.toHaveBeenCalled();
  });

  it("force refresh bypasses the demo-org guard", async () => {
    membershipFindFirst.mockResolvedValue(null);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-08") }]);
    salesInvoiceUpdateMany.mockResolvedValue({ count: 0 });
    salesInvoiceFindMany.mockResolvedValue([{ id: "inv_1" }]);
    salesInvoiceUpdate.mockResolvedValue({});
    inventoryItemFindMany.mockResolvedValue([]);
    vi.mocked(countLowStockItems).mockResolvedValue(4);

    const result = await refreshDemoAccountData("any-org", NOW, { force: true });
    expect(result).not.toBeNull();
    expect(salesInvoiceUpdateMany).toHaveBeenCalled();
  });

  it("reduces 600+ stale unpaid invoices to 6–8 reminders with max 3 overdue", async () => {
    queryRaw.mockResolvedValue([{ max_date: new Date("2025-02-01") }]);
    salesInvoiceUpdateMany.mockResolvedValue({ count: 668 });
    salesInvoiceFindMany.mockResolvedValue(
      Array.from({ length: 80 }, (_, i) => ({ id: `inv_${i}` })),
    );
    salesInvoiceUpdate.mockResolvedValue({});
    inventoryItemFindMany.mockResolvedValue([
      {
        id: "item_1",
        qtyOnHand: "100",
        valueOnHand: 1_000_000n,
        reorderLevel: new (await import("@prisma/client")).Prisma.Decimal(40),
      },
    ]);
    vi.mocked(countLowStockItems).mockResolvedValue(5);

    const result = await refreshDemoAccountData(DEMO_ORG, NOW);

    expect(result).not.toBeNull();
    expect(salesInvoiceUpdateMany).toHaveBeenCalledWith({
      where: { orgId: DEMO_ORG, status: { not: "paid" } },
      data: { status: "paid" },
    });
    expect(salesInvoiceUpdateMany.mock.calls[0]).toBeDefined();
    expect(salesInvoiceUpdate.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(salesInvoiceUpdate.mock.calls.length).toBeLessThanOrEqual(8);
    expect(result!.unpaidInvoices).toBeGreaterThanOrEqual(6);
    expect(result!.unpaidInvoices).toBeLessThanOrEqual(8);
    expect(result!.overdueInvoices).toBeGreaterThanOrEqual(2);
    expect(result!.overdueInvoices).toBeLessThanOrEqual(3);
    expect(result!.shiftedDays).toBeGreaterThan(0);
  });

  it("marks the backlog paid and reopens a small curated set", async () => {
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-08") }]);
    salesInvoiceUpdateMany.mockResolvedValue({ count: 500 });
    salesInvoiceFindMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `inv_${i}` })),
    );
    salesInvoiceUpdate.mockResolvedValue({});
    inventoryItemFindMany.mockResolvedValue([
      {
        id: "item_1",
        qtyOnHand: "100",
        valueOnHand: 1_000_000n,
        reorderLevel: new (await import("@prisma/client")).Prisma.Decimal(40),
      },
    ]);
    vi.mocked(countLowStockItems).mockResolvedValue(4);

    const result = await refreshDemoAccountData(DEMO_ORG, NOW);

    expect(result).not.toBeNull();
    expect(salesInvoiceUpdateMany).toHaveBeenCalledWith({
      where: { orgId: DEMO_ORG, status: { not: "paid" } },
      data: { status: "paid" },
    });
    expect(salesInvoiceUpdate).toHaveBeenCalled();
    expect(result!.unpaidInvoices).toBeGreaterThanOrEqual(6);
    expect(result!.unpaidInvoices).toBeLessThanOrEqual(8);
    expect(result!.overdueInvoices).toBeGreaterThanOrEqual(2);
    expect(result!.overdueInvoices).toBeLessThanOrEqual(3);
  });
});

describe("maybeRefreshDemoAccount", () => {
  it("skips when data is fresh and cooldown has not expired", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(6);
    vi.mocked(countLowStockItems).mockResolvedValue(4);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-08") }]);
    salesInvoiceUpdateMany.mockResolvedValue({ count: 0 });
    salesInvoiceFindMany.mockResolvedValue([{ id: "inv_1" }]);
    salesInvoiceUpdate.mockResolvedValue({});
    inventoryItemFindMany.mockResolvedValue([]);

    await refreshDemoAccountData(DEMO_ORG, NOW);

    vi.mocked(getPaymentReminderCount).mockResolvedValue(6);
    vi.mocked(countLowStockItems).mockResolvedValue(4);
    queryRaw.mockResolvedValue([{ max_date: new Date("2026-07-08") }]);

    const result = await maybeRefreshDemoAccount(DEMO_ORG, NOW);
    expect(result).toBeNull();
  });

  it("refreshes stale data even inside the cooldown window", async () => {
    vi.mocked(getPaymentReminderCount).mockResolvedValue(600);
    vi.mocked(countLowStockItems).mockResolvedValue(0);
    queryRaw.mockResolvedValue([{ max_date: new Date("2025-01-01") }]);
    salesInvoiceUpdateMany.mockResolvedValue({ count: 600 });
    salesInvoiceFindMany.mockResolvedValue([{ id: "inv_1" }, { id: "inv_2" }, { id: "inv_3" }]);
    salesInvoiceUpdate.mockResolvedValue({});
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

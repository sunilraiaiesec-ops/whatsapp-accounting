import { beforeEach, describe, expect, it, vi } from "vitest";

const salesInvoiceCount = vi.fn();
const purchaseInvoiceCount = vi.fn();
const inventoryItemCount = vi.fn();
const partyCount = vi.fn();
const membershipCount = vi.fn();
const getEffectiveSubscription = vi.fn();
const getAiCreditStatus = vi.fn();
const getStorageUsage = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesInvoice: { count: salesInvoiceCount },
    purchaseInvoice: { count: purchaseInvoiceCount },
    inventoryItem: { count: inventoryItemCount },
    party: { count: partyCount },
    membership: { count: membershipCount },
  },
}));

vi.mock("@/lib/billing/subscription", () => ({
  getEffectiveSubscription: (...args: unknown[]) => getEffectiveSubscription(...args),
}));

vi.mock("@/lib/billing/ai-credits", () => ({
  getAiCreditStatus: (...args: unknown[]) => getAiCreditStatus(...args),
}));

vi.mock("@/lib/documents/storage", () => ({
  getStorageUsage: (...args: unknown[]) => getStorageUsage(...args),
}));

const { checkPlanLimit } = await import("@/lib/billing/enforce");

beforeEach(() => {
  salesInvoiceCount.mockReset().mockResolvedValue(0);
  purchaseInvoiceCount.mockReset().mockResolvedValue(0);
  inventoryItemCount.mockReset().mockResolvedValue(0);
  partyCount.mockReset().mockResolvedValue(0);
  membershipCount.mockReset().mockResolvedValue(0);
  getAiCreditStatus.mockReset();
  getStorageUsage.mockReset();
  getEffectiveSubscription.mockReset().mockResolvedValue({ effectivePlan: "FREE" });
});

describe("checkPlanLimit — countable resources (FREE plan)", () => {
  it("allows creation well under the limit with no warning", async () => {
    inventoryItemCount.mockResolvedValue(5); // FREE limit is 50
    const result = await checkPlanLimit("org_1", "inventoryItem");
    expect(result).toEqual({ ok: true });
  });

  it("warns at 80% of the limit but still allows creation", async () => {
    // FREE maxInventoryItems = 50; creating the 40th item -> nextCount=40 -> 40/50=0.8
    inventoryItemCount.mockResolvedValue(39);
    const result = await checkPlanLimit("org_1", "inventoryItem");
    expect(result.ok).toBe(true);
    expect(result.warning).toMatch(/39 of 50/);
  });

  it("blocks creation once the limit is reached, citing plan and limit", async () => {
    inventoryItemCount.mockResolvedValue(50);
    const result = await checkPlanLimit("org_1", "inventoryItem");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/50/);
      expect(result.message).toMatch(/FREE/);
    }
  });

  it("checks customer vs supplier limits independently via Party.type", async () => {
    await checkPlanLimit("org_1", "customer");
    expect(partyCount).toHaveBeenCalledWith({
      where: { orgId: "org_1", type: { in: ["customer", "both"] } },
    });
    await checkPlanLimit("org_1", "supplier");
    expect(partyCount).toHaveBeenCalledWith({
      where: { orgId: "org_1", type: { in: ["supplier", "both"] } },
    });
  });

  it("checks sales and purchase invoice monthly counts independently", async () => {
    salesInvoiceCount.mockResolvedValue(20); // at FREE limit
    const sales = await checkPlanLimit("org_1", "salesInvoice");
    expect(sales.ok).toBe(false);

    purchaseInvoiceCount.mockResolvedValue(0);
    const purchases = await checkPlanLimit("org_1", "purchaseInvoice");
    expect(purchases.ok).toBe(true);
  });

  it("userInvite is checked against total membership count", async () => {
    membershipCount.mockResolvedValue(2); // FREE maxUsers = 2
    const result = await checkPlanLimit("org_1", "userInvite");
    expect(result.ok).toBe(false);
  });
});

describe("checkPlanLimit — countable resources (BUSINESS plan, effectively unlimited)", () => {
  beforeEach(() => {
    getEffectiveSubscription.mockResolvedValue({ effectivePlan: "BUSINESS" });
  });

  it("never blocks or warns regardless of count", async () => {
    inventoryItemCount.mockResolvedValue(1_000_000);
    const result = await checkPlanLimit("org_1", "inventoryItem");
    expect(result).toEqual({ ok: true });
  });
});

describe("checkPlanLimit — aiRequest", () => {
  it("blocks with an upgrade message once credits are exhausted", async () => {
    getAiCreditStatus.mockResolvedValue({ used: 10, limit: 10, remaining: 0, yearMonth: "2026-07" });
    const result = await checkPlanLimit("org_1", "aiRequest");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/10/);
  });

  it("warns near exhaustion but still allows", async () => {
    getAiCreditStatus.mockResolvedValue({ used: 8, limit: 10, remaining: 2, yearMonth: "2026-07" });
    const result = await checkPlanLimit("org_1", "aiRequest");
    expect(result.ok).toBe(true);
    expect(result.warning).toMatch(/2 of 10/);
  });

  it("allows with no warning when plenty of credits remain", async () => {
    getAiCreditStatus.mockResolvedValue({ used: 1, limit: 10, remaining: 9, yearMonth: "2026-07" });
    const result = await checkPlanLimit("org_1", "aiRequest");
    expect(result).toEqual({ ok: true });
  });
});

describe("checkPlanLimit — documentUpload (storage)", () => {
  it("blocks an upload that would exceed the storage limit", async () => {
    getStorageUsage.mockResolvedValue({ usedBytes: 490 * 1024 * 1024, limitBytes: 500 * 1024 * 1024, documentCount: 3 });
    const result = await checkPlanLimit("org_1", "documentUpload", { addBytes: 20 * 1024 * 1024 });
    expect(result.ok).toBe(false);
  });

  it("allows an upload comfortably within the storage limit", async () => {
    getStorageUsage.mockResolvedValue({ usedBytes: 10 * 1024 * 1024, limitBytes: 500 * 1024 * 1024, documentCount: 1 });
    const result = await checkPlanLimit("org_1", "documentUpload", { addBytes: 1024 });
    expect(result).toEqual({ ok: true });
  });
});

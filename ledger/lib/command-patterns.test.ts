import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks: no DB / network. -------------------------------------------------
const inventoryItemFindMany = vi.fn();
const goodsReceiptLineFindMany = vi.fn();
const purchaseInvoiceFindMany = vi.fn();
const paymentFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inventoryItem: { findMany: inventoryItemFindMany },
    goodsReceiptLine: { findMany: goodsReceiptLineFindMany },
    purchaseInvoice: { findMany: purchaseInvoiceFindMany },
    payment: { findMany: paymentFindMany },
  },
}));

const { getCommandPatternSuggestions, dueDateFromTerms } = await import(
  "@/lib/command-patterns"
);

// A decimal-ish fixture matching what Prisma.Decimal quantity fields expose.
function dec(v: string) {
  return { toString: () => v };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

// GoodsReceiptLine backs four different signals, each selecting different
// columns. Dispatch by the requested `select` shape so each signal only ever
// sees the rows shaped for it (and defaults to empty otherwise) — this avoids
// one signal's mock data accidentally crashing/poisoning another that runs in
// the same Promise.all batch.
type GrlRows = {
  itemPattern?: unknown[];
  supplierPattern?: unknown[];
  quantity?: unknown[];
  cost?: unknown[];
};
function mockGoodsReceiptLines(rows: GrlRows) {
  goodsReceiptLineFindMany.mockImplementation((args: { select: Record<string, unknown> }) => {
    const select = args.select;
    if (select.itemId) return Promise.resolve(rows.itemPattern ?? []);
    if (select.quantity) return Promise.resolve(rows.quantity ?? []);
    if (select.unitCost) return Promise.resolve(rows.cost ?? []);
    return Promise.resolve(rows.supplierPattern ?? []);
  });
}

const RICE_50KG = { id: "item_rice_50", name: "Rice 50kg bag", code: "RICE-50", barcode: null };
const RICE_25KG = { id: "item_rice_25", name: "Rice 25kg bag", code: "RICE-25", barcode: null };

beforeEach(() => {
  inventoryItemFindMany.mockReset().mockResolvedValue([]);
  goodsReceiptLineFindMany.mockReset().mockResolvedValue([]);
  purchaseInvoiceFindMany.mockReset().mockResolvedValue([]);
  paymentFindMany.mockReset().mockResolvedValue([]);
  vi.useRealTimers();
});

describe("getCommandPatternSuggestions — supplier suggestion from repeated purchases", () => {
  it("suggests the most-used supplier for a product, even with no supplier named", async () => {
    inventoryItemFindMany.mockResolvedValue([RICE_50KG]);
    mockGoodsReceiptLines({
      supplierPattern: [
        { receipt: { partyId: "sup_A", date: daysAgo(5), party: { name: "Supplier A" } } },
        { receipt: { partyId: "sup_A", date: daysAgo(20), party: { name: "Supplier A" } } },
        { receipt: { partyId: "sup_A", date: daysAgo(40), party: { name: "Supplier A" } } },
        { receipt: { partyId: "sup_B", date: daysAgo(60), party: { name: "Supplier B" } } },
      ],
    });

    const result = await getCommandPatternSuggestions("org_A", {
      action: "receive_stock",
      productQuery: "rice",
      partyType: "supplier",
    });

    expect(result.supplier?.id).toBe("sup_A");
    expect(result.supplier?.count).toBe(3);
    expect(result.supplier?.reason).toMatch(/Supplier A/);
    expect(result.supplier?.reason).toMatch(/3 times/);
    // Recent (5 days ago) evidence + a real pairing frequency => decent bucket.
    expect(["medium", "high"]).toContain(result.supplier?.bucket);
  });

  it("does not suggest a supplier for a customer-side action", async () => {
    inventoryItemFindMany.mockResolvedValue([RICE_50KG]);

    const result = await getCommandPatternSuggestions("org_A", {
      action: "receive_stock",
      productQuery: "rice",
      partyType: "customer",
    });

    expect(result.supplier).toBeUndefined();
  });
});

describe("getCommandPatternSuggestions — item/unit suggestion from historical pattern", () => {
  it("disambiguates a generic product query toward the bag size actually bought", async () => {
    inventoryItemFindMany.mockResolvedValue([RICE_25KG, RICE_50KG]);
    // History overwhelmingly favors the 50kg item, even though both fuzzy-
    // match "rice" about equally on text alone.
    mockGoodsReceiptLines({
      itemPattern: [
        { itemId: RICE_50KG.id, receipt: { date: daysAgo(3) } },
        { itemId: RICE_50KG.id, receipt: { date: daysAgo(10) } },
        { itemId: RICE_50KG.id, receipt: { date: daysAgo(15) } },
        { itemId: RICE_25KG.id, receipt: { date: daysAgo(200) } },
      ],
    });

    const result = await getCommandPatternSuggestions("org_A", {
      action: "receive_stock",
      productQuery: "rice",
    });

    expect(result.item?.id).toBe(RICE_50KG.id);
    expect(result.item?.label).toBe("Rice 50kg bag");
  });
});

describe("getCommandPatternSuggestions — quantity suggestion from common past quantity", () => {
  it("suggests the historical mode quantity for a resolved item", async () => {
    mockGoodsReceiptLines({
      quantity: [
        { quantity: dec("50") },
        { quantity: dec("50") },
        { quantity: dec("50") },
        { quantity: dec("20") },
      ],
    });

    const result = await getCommandPatternSuggestions("org_A", {
      action: "receive_stock",
      resolvedItemId: RICE_50KG.id,
    });

    expect(result.quantity?.value).toBe("50");
    expect(result.quantity?.count).toBe(4);
    expect(["medium", "high"]).toContain(result.quantity?.bucket);
  });
});

describe("getCommandPatternSuggestions — last purchase cost suggestion", () => {
  it("suggests the most recent unit cost, not the average", async () => {
    mockGoodsReceiptLines({
      cost: [
        { unitCost: 21_500n }, // most recent (rows are date-desc ordered)
        { unitCost: 20_000n },
        { unitCost: 20_000n },
      ],
    });

    const result = await getCommandPatternSuggestions("org_A", {
      action: "receive_stock",
      resolvedItemId: RICE_50KG.id,
      currency: "XAF",
    });

    expect(result.costPrice?.value).toBe("21500");
    expect(result.costPrice?.reason).toContain("21,500");
    expect(result.costPrice?.reason).toContain("XAF");
  });
});

describe("getCommandPatternSuggestions — same-weekday pattern", () => {
  it("boosts a supplier's score when today matches the historical delivery weekday", async () => {
    // 2026-01-05 is a Monday (UTC).
    const monday = new Date("2026-01-05T09:00:00.000Z");
    const mondayHistory = [1, 2, 3].map((w) => new Date(monday.getTime() - w * 7 * 86_400_000));

    inventoryItemFindMany.mockResolvedValue([RICE_50KG]);
    mockGoodsReceiptLines({
      supplierPattern: mondayHistory.map((date) => ({
        receipt: { partyId: "sup_A", date, party: { name: "Supplier A" } },
      })),
    });

    vi.useFakeTimers();
    vi.setSystemTime(monday);
    const withWeekdayMatch = await getCommandPatternSuggestions("org_A", {
      action: "receive_stock",
      productQuery: "rice",
    });

    // Same history, but "today" is now a Wednesday — no weekday bonus.
    vi.setSystemTime(new Date("2026-01-07T09:00:00.000Z"));
    const withoutWeekdayMatch = await getCommandPatternSuggestions("org_A", {
      action: "receive_stock",
      productQuery: "rice",
    });
    vi.useRealTimers();

    expect(withWeekdayMatch.supplier!.score).toBeGreaterThan(withoutWeekdayMatch.supplier!.score);
  });
});

describe("getCommandPatternSuggestions — org isolation", () => {
  it("only ever queries within the given orgId; org B's history cannot leak into org A's suggestions", async () => {
    inventoryItemFindMany.mockResolvedValue([RICE_50KG]);

    await getCommandPatternSuggestions("org_A", {
      action: "receive_stock",
      productQuery: "rice",
      resolvedPartyId: "sup_1",
    });

    expect(inventoryItemFindMany.mock.calls.length).toBeGreaterThan(0);
    for (const call of inventoryItemFindMany.mock.calls) {
      expect(call[0].where.orgId).toBe("org_A");
    }
    expect(goodsReceiptLineFindMany.mock.calls.length).toBeGreaterThan(0);
    for (const call of goodsReceiptLineFindMany.mock.calls) {
      expect(call[0].where.receipt.orgId).toBe("org_A");
    }

    await getCommandPatternSuggestions("org_A", {
      action: "supplier_purchase",
      resolvedPartyId: "sup_1",
    });
    expect(purchaseInvoiceFindMany.mock.calls.length).toBeGreaterThan(0);
    for (const call of purchaseInvoiceFindMany.mock.calls) {
      expect(call[0].where.orgId).toBe("org_A");
    }
  });
});

describe("getCommandPatternSuggestions — low confidence", () => {
  it("returns a low bucket for a single, stale, unremarkable occurrence", async () => {
    inventoryItemFindMany.mockResolvedValue([RICE_50KG]);
    mockGoodsReceiptLines({
      // A single delivery, 200 days ago (outside both recency windows) —
      // barely any signal at all.
      supplierPattern: [
        { receipt: { partyId: "sup_A", date: daysAgo(200), party: { name: "Supplier A" } } },
      ],
    });

    const result = await getCommandPatternSuggestions("org_A", {
      action: "receive_stock",
      productQuery: "rice",
    });

    // +40 frequency only (no recency, no weekday-with-2+) => 40, which is "low".
    expect(result.supplier?.score).toBe(40);
    expect(result.supplier?.bucket).toBe("low");
  });
});

describe("dueDateFromTerms", () => {
  it("adds the suggested number of days to the invoice date", () => {
    expect(dueDateFromTerms(new Date("2026-01-01T00:00:00.000Z"), 30)).toBe("2026-01-31");
  });
});

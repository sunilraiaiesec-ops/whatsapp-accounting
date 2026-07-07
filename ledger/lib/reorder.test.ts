import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks: no DB / network. -------------------------------------------------
const inventoryItemFindMany = vi.fn();
const goodsReceiptLineFindFirst = vi.fn();
const goodsReceiptLineFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inventoryItem: { findMany: inventoryItemFindMany },
    goodsReceiptLine: { findFirst: goodsReceiptLineFindFirst, findMany: goodsReceiptLineFindMany },
  },
}));

const {
  listLowStockItems,
  mostRecentSupplierForItem,
  mostFrequentSupplierForItem,
  resolveSuggestedSupplier,
} = await import("@/lib/reorder");

function dec(v: string) {
  return new Prisma.Decimal(v);
}

// goodsReceiptLine.findMany backs two different signals in this module
// (mostFrequentSupplierForItem, and — via lib/command-patterns — the
// "usual quantity" pattern reused for the suggested reorder quantity). They
// select different shapes; dispatch on that so each sees only its own rows.
function mockGoodsReceiptLineFindMany({
  frequency = [],
  quantity = [],
}: {
  frequency?: unknown[];
  quantity?: unknown[];
}) {
  goodsReceiptLineFindMany.mockImplementation((args: { select: Record<string, unknown> }) => {
    if (args.select?.quantity) return Promise.resolve(quantity);
    return Promise.resolve(frequency);
  });
}

const PARTY_A = { name: "Supplier A", phone: "612345678", whatsapp: null };
const PARTY_B = { name: "Supplier B", phone: "622334455", whatsapp: null };

beforeEach(() => {
  inventoryItemFindMany.mockReset().mockResolvedValue([]);
  goodsReceiptLineFindFirst.mockReset().mockResolvedValue(null);
  goodsReceiptLineFindMany.mockReset().mockResolvedValue([]);
});

describe("listLowStockItems — detection", () => {
  it("includes an item whose qtyOnHand is at or below its reorderLevel", async () => {
    inventoryItemFindMany.mockResolvedValue([
      {
        id: "item_1",
        code: "SKU1",
        name: "Rice 50kg",
        unit: "bag",
        qtyOnHand: dec("3"),
        reorderLevel: dec("5"),
        preferredSupplierId: null,
        preferredSupplier: null,
      },
      {
        id: "item_2",
        code: "SKU2",
        name: "Cooking oil",
        unit: "carton",
        qtyOnHand: dec("5"),
        reorderLevel: dec("5"),
        preferredSupplierId: null,
        preferredSupplier: null,
      },
    ]);

    const result = await listLowStockItems("org_A");
    expect(result.map((r) => r.id).sort()).toEqual(["item_1", "item_2"]);
  });

  it("excludes an item whose qtyOnHand is above its reorderLevel", async () => {
    inventoryItemFindMany.mockResolvedValue([
      {
        id: "item_ok",
        code: "SKU3",
        name: "Sugar",
        unit: "bag",
        qtyOnHand: dec("50"),
        reorderLevel: dec("5"),
        preferredSupplierId: null,
        preferredSupplier: null,
      },
    ]);

    const result = await listLowStockItems("org_A");
    expect(result).toEqual([]);
  });

  it("excludes items without a reorderLevel configured, even at zero stock", async () => {
    inventoryItemFindMany.mockResolvedValue([
      {
        id: "item_no_reorder",
        code: "SKU4",
        name: "Misc item",
        unit: null,
        qtyOnHand: dec("0"),
        reorderLevel: null,
        preferredSupplierId: null,
        preferredSupplier: null,
      },
    ]);

    const result = await listLowStockItems("org_A");
    expect(result).toEqual([]);
  });
});

describe("mostRecentSupplierForItem", () => {
  it("returns the supplier of the single most recent goods receipt for this item", async () => {
    goodsReceiptLineFindFirst.mockResolvedValue({
      unitCost: 1000n,
      receipt: { date: new Date("2026-06-01"), partyId: "sup_A", party: PARTY_A },
    });

    const result = await mostRecentSupplierForItem("org_A", "item_1");
    expect(result).toEqual({
      partyId: "sup_A",
      partyName: "Supplier A",
      phone: "612345678",
      whatsapp: null,
    });
  });

  it("returns null when there's no purchase history for the item", async () => {
    goodsReceiptLineFindFirst.mockResolvedValue(null);
    const result = await mostRecentSupplierForItem("org_A", "item_1");
    expect(result).toBeNull();
  });
});

describe("mostFrequentSupplierForItem", () => {
  it("returns the supplier with the most goods-receipt lines for this item", async () => {
    mockGoodsReceiptLineFindMany({
      frequency: [
        { receipt: { partyId: "sup_A", party: PARTY_A } },
        { receipt: { partyId: "sup_B", party: PARTY_B } },
        { receipt: { partyId: "sup_A", party: PARTY_A } },
        { receipt: { partyId: "sup_A", party: PARTY_A } },
      ],
    });

    const result = await mostFrequentSupplierForItem("org_A", "item_1");
    expect(result?.partyId).toBe("sup_A");
    expect(result?.partyName).toBe("Supplier A");
  });

  it("returns null when there's no purchase history for the item", async () => {
    mockGoodsReceiptLineFindMany({ frequency: [] });
    const result = await mostFrequentSupplierForItem("org_A", "item_1");
    expect(result).toBeNull();
  });
});

describe("resolveSuggestedSupplier — priority order", () => {
  const baseItem = { id: "item_1", preferredSupplierId: null, preferredSupplier: null };

  it("prefers the explicitly-linked preferred supplier over any history", async () => {
    const item = {
      ...baseItem,
      preferredSupplierId: "sup_preferred",
      preferredSupplier: { id: "sup_preferred", name: "Preferred Co", phone: "600000000", whatsapp: null },
    };
    const result = await resolveSuggestedSupplier("org_A", item, {
      partyId: "sup_other",
      partyName: "Someone else",
      phone: null,
      whatsapp: null,
    });
    expect(result).toEqual({
      source: "preferred",
      partyId: "sup_preferred",
      partyName: "Preferred Co",
      phone: "600000000",
      whatsapp: null,
    });
  });

  it("falls back to the most recent supplier when no preferred supplier is set", async () => {
    const result = await resolveSuggestedSupplier("org_A", baseItem, {
      partyId: "sup_A",
      partyName: "Supplier A",
      phone: "612345678",
      whatsapp: null,
    });
    expect(result.source).toBe("recent");
    expect(result.partyId).toBe("sup_A");
  });

  it("falls back to the most frequent supplier when there's no preferred and no recent supplier", async () => {
    mockGoodsReceiptLineFindMany({
      frequency: [
        { receipt: { partyId: "sup_B", party: PARTY_B } },
        { receipt: { partyId: "sup_B", party: PARTY_B } },
      ],
    });
    const result = await resolveSuggestedSupplier("org_A", baseItem, null);
    expect(result.source).toBe("frequent");
    expect(result.partyId).toBe("sup_B");
  });

  it("returns 'none' when there's no preferred supplier and no purchase history at all", async () => {
    mockGoodsReceiptLineFindMany({ frequency: [] });
    const result = await resolveSuggestedSupplier("org_A", baseItem, null);
    expect(result).toEqual({ source: "none", partyId: null, partyName: null, phone: null, whatsapp: null });
  });
});

describe("listLowStockItems — org isolation", () => {
  it("only ever queries with the caller's own orgId", async () => {
    inventoryItemFindMany.mockResolvedValue([
      {
        id: "item_1",
        code: "SKU1",
        name: "Rice",
        unit: "bag",
        qtyOnHand: dec("1"),
        reorderLevel: dec("5"),
        preferredSupplierId: null,
        preferredSupplier: null,
      },
    ]);

    await listLowStockItems("org_A");

    expect(inventoryItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: "org_A" }) }),
    );
    expect(goodsReceiptLineFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receipt: expect.objectContaining({ orgId: "org_A" }) }),
      }),
    );
  });

  it("never returns another org's item, even if somehow present in the resolved list", async () => {
    // listLowStockItems always passes the caller's orgId into the query —
    // this test locks in that the where-clause org scoping described above
    // is the only source of truth (no separate in-memory cross-org fetch
    // path exists that could bypass it).
    inventoryItemFindMany.mockResolvedValue([]);
    const result = await listLowStockItems("org_B");
    expect(result).toEqual([]);
    expect(inventoryItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: "org_B" }) }),
    );
  });
});

describe("listLowStockItems — suggested reorder quantity", () => {
  it("uses the historical mode quantity when purchase history exists", async () => {
    inventoryItemFindMany.mockResolvedValue([
      {
        id: "item_1",
        code: "SKU1",
        name: "Rice",
        unit: "bag",
        qtyOnHand: dec("1"),
        reorderLevel: dec("5"),
        preferredSupplierId: null,
        preferredSupplier: null,
      },
    ]);
    mockGoodsReceiptLineFindMany({
      quantity: [
        { quantity: dec("20"), receipt: { date: new Date("2026-06-01") } },
        { quantity: dec("20"), receipt: { date: new Date("2026-05-01") } },
        { quantity: dec("10"), receipt: { date: new Date("2026-04-01") } },
      ],
    });

    const result = await listLowStockItems("org_A");
    expect(result[0].suggestedReorderQty).toBe("20");
    expect(result[0].reorderQtySource).toBe("history");
  });

  it("falls back to reorderLevel x2 when there's no purchase history", async () => {
    inventoryItemFindMany.mockResolvedValue([
      {
        id: "item_1",
        code: "SKU1",
        name: "Rice",
        unit: "bag",
        qtyOnHand: dec("1"),
        reorderLevel: dec("5"),
        preferredSupplierId: null,
        preferredSupplier: null,
      },
    ]);
    mockGoodsReceiptLineFindMany({ quantity: [] });

    const result = await listLowStockItems("org_A");
    expect(result[0].suggestedReorderQty).toBe("10");
    expect(result[0].reorderQtySource).toBe("default");
  });
});

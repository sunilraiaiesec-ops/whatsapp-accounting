import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { quantityPatternForItem } from "@/lib/command-patterns";

// ---------------------------------------------------------------------------
// Low-stock detection + supplier suggestion for the "request quote on
// WhatsApp" flow. Everything here is org-scoped (every query is filtered by
// `orgId`) — no cross-tenant data ever enters a suggestion.
//
// Supplier suggestion priority:
//   1. InventoryItem.preferredSupplierId, if explicitly set on the item.
//   2. The supplier of the single most recent goods receipt for this item.
//   3. The most frequent supplier across this item's goods-receipt history.
//   4. None — the user picks a supplier manually.
// In practice tier 2 already resolves whenever the item has ANY purchase
// history at all (it's simply the most recent row), so tier 3 is reached
// only when there's no history to look at — at which point tier 3 also has
// nothing to find. It's kept as its own independently-testable function
// (rather than folded into tier 2) both to match the requested priority
// order exactly and to keep the door open for a future refinement (e.g.
// scoping "recent" to a lookback window and falling back to "frequent"
// beyond it, the way lib/command-patterns.ts does for other signals).
// ---------------------------------------------------------------------------

// Rows fetched per item when deriving the "most frequent supplier" signal —
// bounded so a single very-long-lived item can't blow up the query.
const SUPPLIER_HISTORY_ROW_CAP = 200;

// Heuristic for the suggested reorder quantity when there's no purchase
// history to learn a typical batch size from: reorder level x this
// multiplier. Deliberately small and simple — this is a starting point for
// the user to edit, not a forecast.
const REORDER_LEVEL_MULTIPLIER = 2;

export type SuggestedSupplierSource = "preferred" | "recent" | "frequent" | "none";

export type SuggestedSupplier = {
  source: SuggestedSupplierSource;
  partyId: string | null;
  partyName: string | null;
  phone: string | null;
  whatsapp: string | null;
};

export type LastPurchase = {
  price: bigint; // minor units
  date: Date;
  partyName: string;
};

export type LowStockItem = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  qtyOnHand: string;
  reorderLevel: string;
  suggestedReorderQty: string;
  reorderQtySource: "history" | "default";
  supplier: SuggestedSupplier;
  lastPurchase: LastPurchase | null;
};

const NONE_SUPPLIER: SuggestedSupplier = {
  source: "none",
  partyId: null,
  partyName: null,
  phone: null,
  whatsapp: null,
};

type PartyContact = { name: string; phone: string | null; whatsapp: string | null };

// The single most recent goods-receipt line for this item, org-scoped.
// Doubles as both the "most recent supplier" signal and the "last purchase
// price/date" shown on the low-stock card — same underlying row, one query.
async function mostRecentPurchase(
  orgId: string,
  itemId: string,
): Promise<{ partyId: string; party: PartyContact; unitCost: bigint; date: Date } | null> {
  const row = await prisma.goodsReceiptLine.findFirst({
    where: { itemId, receipt: { orgId } },
    select: {
      unitCost: true,
      receipt: {
        select: { date: true, partyId: true, party: { select: { name: true, phone: true, whatsapp: true } } },
      },
    },
    orderBy: { receipt: { date: "desc" } },
  });
  if (!row) return null;
  return {
    partyId: row.receipt.partyId,
    party: row.receipt.party,
    unitCost: row.unitCost,
    date: row.receipt.date,
  };
}

// Exported for independent testing — "most recent supplier from purchase
// history for that item" (priority tier 2).
export async function mostRecentSupplierForItem(
  orgId: string,
  itemId: string,
): Promise<Omit<SuggestedSupplier, "source"> | null> {
  const purchase = await mostRecentPurchase(orgId, itemId);
  if (!purchase) return null;
  return {
    partyId: purchase.partyId,
    partyName: purchase.party.name,
    phone: purchase.party.phone,
    whatsapp: purchase.party.whatsapp,
  };
}

// Exported for independent testing — "most frequent supplier from that
// history" (priority tier 3).
export async function mostFrequentSupplierForItem(
  orgId: string,
  itemId: string,
): Promise<Omit<SuggestedSupplier, "source"> | null> {
  const rows = await prisma.goodsReceiptLine.findMany({
    where: { itemId, receipt: { orgId } },
    select: {
      receipt: { select: { partyId: true, party: { select: { name: true, phone: true, whatsapp: true } } } },
    },
    take: SUPPLIER_HISTORY_ROW_CAP,
  });
  if (rows.length === 0) return null;

  const byParty = new Map<string, PartyContact & { count: number }>();
  for (const r of rows) {
    const pid = r.receipt.partyId;
    const entry = byParty.get(pid) ?? { ...r.receipt.party, count: 0 };
    entry.count += 1;
    byParty.set(pid, entry);
  }
  const ranked = [...byParty.entries()].sort((a, b) => b[1].count - a[1].count);
  const [topId, top] = ranked[0];
  return { partyId: topId, partyName: top.name, phone: top.phone, whatsapp: top.whatsapp };
}

type ItemForSupplierResolution = {
  id: string;
  preferredSupplierId: string | null;
  preferredSupplier: PartyContact & { id: string } | null;
};

// Applies the full priority chain for a single item. `precomputedRecent` lets
// listLowStockItems() pass in a "most recent supplier" it already fetched
// (for the last-purchase-price/date card fields) instead of re-querying —
// pass nothing to have this resolve it itself (e.g. when called standalone).
export async function resolveSuggestedSupplier(
  orgId: string,
  item: ItemForSupplierResolution,
  precomputedRecent?: Omit<SuggestedSupplier, "source"> | null,
): Promise<SuggestedSupplier> {
  if (item.preferredSupplierId && item.preferredSupplier) {
    return {
      source: "preferred",
      partyId: item.preferredSupplier.id,
      partyName: item.preferredSupplier.name,
      phone: item.preferredSupplier.phone,
      whatsapp: item.preferredSupplier.whatsapp,
    };
  }

  const recent = precomputedRecent !== undefined ? precomputedRecent : await mostRecentSupplierForItem(orgId, item.id);
  if (recent) return { source: "recent", ...recent };

  const frequent = await mostFrequentSupplierForItem(orgId, item.id);
  if (frequent) return { source: "frequent", ...frequent };

  return NONE_SUPPLIER;
}

// Suggested reorder quantity: prefer the org's own historical "usual
// quantity" for this item (mode quantity from GoodsReceiptLine, reusing the
// same signal Ask Bantoo's pattern-learning already derives) when there's
// enough history to trust it; otherwise fall back to reorder level x a
// small multiplier as a simple, editable starting point.
async function suggestedReorderQuantity(
  orgId: string,
  itemId: string,
  reorderLevel: Prisma.Decimal,
): Promise<{ value: string; source: "history" | "default" }> {
  const pattern = await quantityPatternForItem(orgId, [itemId]);
  if (pattern) {
    return { value: pattern.value, source: "history" };
  }
  const fallback = reorderLevel.gt(0)
    ? reorderLevel.times(REORDER_LEVEL_MULTIPLIER)
    : new Prisma.Decimal(REORDER_LEVEL_MULTIPLIER);
  return { value: fallback.toString(), source: "default" };
}

// Lightweight count for the dashboard alert badge — avoids resolving a
// supplier/last-purchase/quantity suggestion for every item just to show a
// number.
export async function countLowStockItems(orgId: string): Promise<number> {
  const items = await prisma.inventoryItem.findMany({
    where: { orgId, reorderLevel: { not: null } },
    select: { qtyOnHand: true, reorderLevel: true },
  });
  return items.filter(
    (it) => it.reorderLevel != null && new Prisma.Decimal(it.qtyOnHand).lte(it.reorderLevel),
  ).length;
}

// Items at or below their reorder level. Items without a reorder level
// configured are excluded (there's nothing to alert on). Org-scoped.
export async function listLowStockItems(orgId: string): Promise<LowStockItem[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { orgId, reorderLevel: { not: null } },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      qtyOnHand: true,
      reorderLevel: true,
      preferredSupplierId: true,
      preferredSupplier: { select: { id: true, name: true, phone: true, whatsapp: true } },
    },
    orderBy: { code: "asc" },
  });

  const low = items.filter(
    (it) => it.reorderLevel != null && new Prisma.Decimal(it.qtyOnHand).lte(it.reorderLevel),
  );
  if (low.length === 0) return [];

  return Promise.all(
    low.map(async (it) => {
      const reorderLevel = it.reorderLevel as Prisma.Decimal;
      const [purchase, qty] = await Promise.all([
        mostRecentPurchase(orgId, it.id),
        suggestedReorderQuantity(orgId, it.id, reorderLevel),
      ]);
      const recentSupplier = purchase
        ? {
            partyId: purchase.partyId,
            partyName: purchase.party.name,
            phone: purchase.party.phone,
            whatsapp: purchase.party.whatsapp,
          }
        : null;
      const supplier = await resolveSuggestedSupplier(orgId, it, recentSupplier);

      return {
        id: it.id,
        code: it.code,
        name: it.name,
        unit: it.unit,
        qtyOnHand: new Prisma.Decimal(it.qtyOnHand).toString(),
        reorderLevel: reorderLevel.toString(),
        suggestedReorderQty: qty.value,
        reorderQtySource: qty.source,
        supplier,
        lastPurchase: purchase
          ? { price: purchase.unitCost, date: purchase.date, partyName: purchase.party.name }
          : null,
      };
    }),
  );
}

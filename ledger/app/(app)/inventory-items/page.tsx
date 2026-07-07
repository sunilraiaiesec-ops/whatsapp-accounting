import { requireContext } from "@/lib/auth/current";
import { listInventoryItems } from "@/lib/inventory";
import { listLowStockItems } from "@/lib/reorder";
import { formatAmount } from "@/lib/money";
import { InventoryItemForm } from "@/components/InventoryItemForm";
import { LowStockReorderList, type LowStockItemVM } from "@/components/LowStockReorder";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function InventoryItemsPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const [items, lowStock] = await Promise.all([
    listInventoryItems(ctx.orgId),
    listLowStockItems(ctx.orgId),
  ]);

  const lowStockCards: LowStockItemVM[] = lowStock.map((it) => ({
    id: it.id,
    code: it.code,
    name: it.name,
    unit: it.unit ?? "units",
    qtyOnHand: it.qtyOnHand,
    reorderLevel: it.reorderLevel,
    suggestedReorderQty: it.suggestedReorderQty,
    supplier: it.supplier,
    lastPurchase: it.lastPurchase
      ? {
          priceFormatted: formatAmount(it.lastPurchase.price, cur),
          date: it.lastPurchase.date.toISOString().slice(0, 10),
          partyName: it.lastPurchase.partyName,
        }
      : null,
  }));
  const totalValue = items.reduce((s, it) => s + it.valueOnHand, 0n);
  const outOfStock = items.filter((it) => it.qtyOnHand.lte(0)).length;
  const belowReorder = items.filter(
    (it) => it.reorderLevel != null && it.qtyOnHand.lte(it.reorderLevel),
  ).length;

  const rows: ListRow[] = items.map((it) => ({
    id: it.id,
    code: it.code,
    barcode: it.barcode ?? "—",
    name: it.name,
    unit: it.unit ?? "—",
    salePrice: formatAmount(it.salePrice, cur),
    tax: it.defaultTaxRate != null ? `${Number(it.defaultTaxRate)}%` : "—",
    onHand: it.qtyOnHand.toString(),
    reorder: it.reorderLevel != null ? it.reorderLevel.toString() : "—",
    avgCost: formatAmount(it.avgCost, cur),
    value: formatAmount(it.valueOnHand, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inventory items"
        subtitle="Products you buy and sell. Quantities and average cost update from goods receipts and write-offs."
      />

      <StatGrid>
        <StatCard icon="box" tone="emerald" label="Items" value={String(items.length)} />
        <StatCard icon="sum" tone="blue" label="Total stock value" value={formatAmount(totalValue, cur)} unit={cur} />
        <StatCard icon="doc" tone="amber" label="Below reorder level" value={String(belowReorder)} />
        <StatCard icon="doc" tone="rose" label="Out of stock" value={String(outOfStock)} />
      </StatGrid>

      {lowStockCards.length > 0 ? (
        <div className="mt-6">
          <LowStockReorderList items={lowStockCards} />
        </div>
      ) : null}

      <div className="mt-6">
        <InventoryItemForm currency={cur} />
      </div>

      <div className="mt-6">
        <ListView
          rows={rows}
          currency={cur}
          searchKeys={["code", "name", "barcode"]}
          emptyText="No items yet. Add your first item above, then receive stock."
          columns={[
            { key: "code", header: "SKU", kind: "mono" },
            { key: "barcode", header: "Barcode", kind: "mono" },
            { key: "name", header: "Name" },
            { key: "unit", header: "Unit" },
            { key: "salePrice", header: "Sale price", kind: "amount", align: "right" },
            { key: "tax", header: "Tax", align: "right" },
            { key: "onHand", header: "On hand", align: "right" },
            { key: "reorder", header: "Reorder", align: "right" },
            { key: "avgCost", header: "Avg cost", kind: "amount", align: "right" },
            { key: "value", header: "Stock value", kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}

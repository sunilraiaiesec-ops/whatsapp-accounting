import { requireContext } from "@/lib/auth/current";
import { listInventoryItems } from "@/lib/inventory";
import { formatAmount } from "@/lib/money";
import { InventoryItemForm } from "@/components/InventoryItemForm";

export default async function InventoryItemsPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const items = await listInventoryItems(ctx.orgId);
  const totalValue = items.reduce((s, it) => s + it.valueOnHand, 0n);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Inventory Items</h1>
      <p className="text-sm text-slate-500">
        Products you buy and sell. Quantities and average cost update from goods
        receipts and write-offs.
      </p>

      <div className="mt-6">
        <InventoryItemForm currency={cur} />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {items.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No items yet. Add your first item above, then receive stock.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 text-right font-medium">Sale price</th>
                <th className="px-4 py-2 text-right font-medium">On hand</th>
                <th className="px-4 py-2 text-right font-medium">Avg cost</th>
                <th className="px-4 py-2 text-right font-medium">Stock value</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{it.code}</td>
                  <td className="px-4 py-2 text-slate-900">{it.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(it.salePrice, cur)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {it.qtyOnHand.toString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(it.avgCost, cur)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(it.valueOnHand, cur)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="px-4 py-2" colSpan={5}>
                  Total stock value
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(totalValue, cur)} {cur}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

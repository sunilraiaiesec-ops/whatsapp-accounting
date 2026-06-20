import { ReportBackLink } from "@/components/ReportBackLink";
import { requireContext } from "@/lib/auth/current";
import { formatAmount } from "@/lib/money";
import { inventoryValuation } from "@/lib/reports";

export default async function InventoryValuationReportPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const { rows, total } = await inventoryValuation(ctx.orgId);

  return (
    <div className="mx-auto max-w-3xl">
      <ReportBackLink />
      <h1 className="mt-2 text-2xl font-semibold">Inventory Valuation Summary</h1>
      <p className="text-sm text-[var(--muted)]">
        Stock on hand at weighted-average cost.
      </p>

      <div className="mt-6 card-surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--muted)]">No stock on hand.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-slate-400">{row.code}</span> {row.name}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.qtyOnHand}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {formatAmount(row.valueOnHand, cur)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2" colSpan={2}>
                  Total inventory value
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(total, cur)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

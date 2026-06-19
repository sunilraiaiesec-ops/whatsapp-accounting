import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { listInventoryWriteOffs } from "@/lib/inventory";
import { formatAmount } from "@/lib/money";

export default async function InventoryWriteOffsPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const writeOffs = await listInventoryWriteOffs(ctx.orgId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory Write-offs</h1>
          <p className="text-sm text-slate-500">
            Damaged, lost, or expired stock — removed at average cost.
          </p>
        </div>
        <Link
          href="/inventory-write-offs/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New write-off
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {writeOffs.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No write-offs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Expense account</th>
                <th className="px-4 py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {writeOffs.map((w) => (
                <tr
                  key={w.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link
                      href={`/inventory-write-offs/${w.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {w.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{w.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-slate-700">{w.expenseAccount.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(w.total, cur)} {cur}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

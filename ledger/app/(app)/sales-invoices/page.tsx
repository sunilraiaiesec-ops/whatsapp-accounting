import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { listSalesInvoices } from "@/lib/documents";
import { formatAmount } from "@/lib/money";

export default async function SalesInvoicesPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const invoices = await listSalesInvoices(ctx.orgId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sales Invoices</h1>
          <p className="text-sm text-slate-500">Credit sales to your customers.</p>
        </div>
        <Link
          href="/sales-invoices/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New invoice
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {invoices.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/sales-invoices/${inv.id}`} className="text-blue-600 hover:underline">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{inv.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-slate-700">{inv.party.name}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(inv.total, cur)} {cur}
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

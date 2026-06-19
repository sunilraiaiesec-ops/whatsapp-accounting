import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { listPurchaseInvoices } from "@/lib/documents";
import { formatAmount } from "@/lib/money";

export default async function PurchaseInvoicesPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const invoices = await listPurchaseInvoices(ctx.orgId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Purchase Invoices</h1>
          <p className="text-sm text-slate-500">
            Bills from suppliers, on credit (Accounts payable).
          </p>
        </div>
        <Link
          href="/purchase-invoices/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New purchase invoice
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {invoices.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No purchase invoices yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Supplier</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link
                      href={`/purchase-invoices/${inv.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{inv.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-slate-700">{inv.party.name}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "—"}
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

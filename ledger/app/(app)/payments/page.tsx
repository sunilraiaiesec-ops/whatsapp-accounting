import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { listPayments } from "@/lib/documents";
import { formatAmount } from "@/lib/money";

export default async function PaymentsPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const payments = await listPayments(ctx.orgId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-slate-500">Money paid out of bank or cash.</p>
        </div>
        <Link
          href="/payments/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New payment
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {payments.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No payments yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Paid to</th>
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/payments/${p.id}`} className="text-blue-600 hover:underline">
                      {p.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{p.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-slate-700">{p.party?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{p.bankAccount.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(p.total, cur)} {cur}
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

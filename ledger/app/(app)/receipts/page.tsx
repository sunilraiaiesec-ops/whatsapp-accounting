import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { listReceipts } from "@/lib/documents";
import { formatAmount } from "@/lib/money";

export default async function ReceiptsPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const receipts = await listReceipts(ctx.orgId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Receipts</h1>
          <p className="text-sm text-slate-500">Money received into bank or cash.</p>
        </div>
        <Link
          href="/receipts/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New receipt
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {receipts.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No receipts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Received from</th>
                <th className="px-4 py-2 font-medium">Into</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/receipts/${r.id}`} className="text-blue-600 hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-slate-700">{r.party?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{r.bankAccount.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(r.total, cur)} {cur}
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

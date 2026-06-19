import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { listInterAccountTransfers } from "@/lib/documents";
import { formatAmount } from "@/lib/money";

export default async function InterAccountTransfersPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const transfers = await listInterAccountTransfers(ctx.orgId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inter Account Transfers</h1>
          <p className="text-sm text-slate-500">
            Move money between your bank and cash accounts.
          </p>
        </div>
        <Link
          href="/inter-account-transfers/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New transfer
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {transfers.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No transfers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">To</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link
                      href={`/inter-account-transfers/${t.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {t.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{t.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-slate-700">{t.fromAccount.name}</td>
                  <td className="px-4 py-2 text-slate-700">{t.toAccount.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(t.amount, cur)} {cur}
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

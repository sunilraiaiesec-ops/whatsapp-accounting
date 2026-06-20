import Link from "next/link";

import { ReportBackLink } from "@/components/ReportBackLink";
import { requireContext } from "@/lib/auth/current";
import { formatAmount } from "@/lib/money";
import { partyBalanceSummary } from "@/lib/reports";

export default async function CustomerBalancesReportPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const { rows, total } = await partyBalanceSummary(ctx.orgId, "customer");

  return (
    <div className="mx-auto max-w-3xl">
      <ReportBackLink />
      <h1 className="mt-2 text-2xl font-semibold">Customer Balance Summary</h1>
      <p className="text-sm text-[var(--muted)]">
        Amounts customers owe you on accounts receivable.
      </p>

      <div className="mt-6 card-surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--muted)]">No open customer balances.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-4 py-2">
                    <Link href={`/customers/${row.id}`} className="font-medium text-[var(--brand)] hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {formatAmount(row.balance, cur)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(total, cur)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

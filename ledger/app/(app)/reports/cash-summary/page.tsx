import { ReportBackLink } from "@/components/ReportBackLink";
import { requireContext } from "@/lib/auth/current";
import { formatAmount } from "@/lib/money";
import { cashSummary } from "@/lib/reports";

export default async function CashSummaryReportPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const { accounts, total } = await cashSummary(ctx.orgId);

  return (
    <div className="mx-auto max-w-3xl">
      <ReportBackLink />
      <h1 className="mt-2 text-2xl font-semibold">Cash & Bank Summary</h1>
      <p className="text-sm text-[var(--muted)]">Current balances in all bank and cash accounts.</p>

      <div className="mt-6 card-surface overflow-hidden">
        {accounts.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--muted)]">No bank or cash accounts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-slate-400">{a.code}</span> {a.name}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {formatAmount(a.balance, cur)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2">Total cash & bank</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(total, cur)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

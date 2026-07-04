import { ReportBackLink } from "@/components/ReportBackLink";
import { requireContext } from "@/lib/auth/current";
import { profitAndLoss, type AccountAmount } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

type Line = AccountAmount & { amount: bigint };

export default async function ProfitLossPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const now = new Date();
  const from = new Date(now.getFullYear(), 0, 1);
  const to = now;
  const pnl = await profitAndLoss(ctx.orgId, from, to);

  return (
    <div className="mx-auto max-w-2xl">
      <ReportBackLink />
      <h1 className="mt-2 text-2xl font-semibold">Profit &amp; Loss</h1>
      <p className="text-sm text-[var(--muted)]">
        {from.toISOString().slice(0, 10)} → {to.toISOString().slice(0, 10)} · all
        amounts in {cur}.
      </p>

      <div className="mt-6 space-y-6">
        <Section
          title="Income"
          lines={pnl.income as Line[]}
          total={pnl.totalIncome}
          cur={cur}
        />
        <Section
          title="Expenses"
          lines={pnl.expenses as Line[]}
          total={pnl.totalExpenses}
          cur={cur}
        />
      </div>

      <div className="mt-6 flex justify-between card-surface p-4">
        <span className="font-semibold">Net profit</span>
        <span
          className={`font-semibold tabular-nums ${
            pnl.netProfit >= 0n ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {formatAmount(pnl.netProfit, cur)} {cur}
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  lines,
  total,
  cur,
}: {
  title: string;
  lines: Line[];
  total: bigint;
  cur: string;
}) {
  return (
    <section className="card-surface overflow-hidden">
      <div className="border-b border-[var(--border)] bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-sm text-slate-400">
                No {title.toLowerCase()} recorded in this period.
              </td>
            </tr>
          ) : (
            lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-slate-400">
                    {l.code}
                  </span>{" "}
                  {l.name}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(l.amount, cur)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <td className="px-4 py-2">Total {title.toLowerCase()}</td>
            <td className="px-4 py-2 text-right tabular-nums">
              {formatAmount(total, cur)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

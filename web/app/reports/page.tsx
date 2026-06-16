import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { formatFcfa, formatNumber } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { MonthlyReport } from "@/lib/types";

export default async function ReportsPage() {
  const report = await serverApi<MonthlyReport>("reports/monthly");

  return (
    <AppShell
      title="Monthly report"
      subtitle={report.period_label}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net cash" value={formatFcfa(report.cash.net_cash)} />
        <StatCard label="Receipts" value={formatFcfa(report.cash.total_receipts)} />
        <StatCard label="Expenses" value={formatFcfa(report.cash.total_expenses)} />
        <StatCard
          label="Goods delivered"
          value={formatFcfa(report.deliveries.total_goods_value)}
          hint={`${formatNumber(report.deliveries.total_quantity)} units`}
        />
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Deliveries this month</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Total notes</dt>
              <dd>{report.deliveries.delivery_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Pending review</dt>
              <dd>{report.deliveries.pending_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Review queue total</dt>
              <dd>{report.review_queue.total}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Top parties owed</h2>
          {report.top_parties_owed.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No outstanding balances.</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {report.top_parties_owed.map((party) => (
                <li key={party.id} className="flex justify-between gap-4">
                  <span>{party.name}</span>
                  <span className="font-medium">{formatFcfa(party.amount_owed)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </AppShell>
  );
}

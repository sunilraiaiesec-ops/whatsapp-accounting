import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { formatFcfa } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { SummaryResponse } from "@/lib/types";

export default async function DashboardPage() {
  const summary = await serverApi<SummaryResponse>("summary");

  return (
    <AppShell
      title="Dashboard"
      subtitle="Cash position and items needing review"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Net balance"
          value={formatFcfa(summary.cash.net_balance)}
          tone={summary.cash.net_balance >= 0 ? "positive" : "danger"}
        />
        <StatCard
          label="Total receipts"
          value={formatFcfa(summary.cash.total_receipts)}
        />
        <StatCard
          label="Total expenses"
          value={formatFcfa(summary.cash.total_expenses)}
        />
        <StatCard
          label="Pending review"
          value={String(summary.review.total)}
          hint={`${summary.review.pending_transactions} cash · ${summary.review.pending_deliveries} deliveries`}
          tone={summary.review.total > 0 ? "warning" : "default"}
        />
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Quick links</h2>
        <p className="mt-2 text-sm text-slate-600">
          Use the tabs above to review pending items, check party balances,
          monthly reports, and product prices.
        </p>
      </section>
    </AppShell>
  );
}

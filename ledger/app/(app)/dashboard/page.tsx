import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { balanceSheet, profitAndLoss } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [bs, pnl] = await Promise.all([
    balanceSheet(ctx.orgId),
    profitAndLoss(ctx.orgId, monthStart, monthEnd),
  ]);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Financial position from your general ledger.
          </p>
        </div>
        <Link
          href="/journal/new"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          New journal entry
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total assets" value={formatAmount(bs.totalAssets, cur)} unit={cur} />
        <Stat
          label="Total liabilities"
          value={formatAmount(bs.totalLiabilities, cur)}
          unit={cur}
        />
        <Stat label="Equity" value={formatAmount(bs.totalEquity, cur)} unit={cur} />
        <Stat
          label="Net profit (this month)"
          value={formatAmount(pnl.netProfit, cur)}
          unit={cur}
          tone={pnl.netProfit >= 0n ? "positive" : "danger"}
        />
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold">Balance check</h2>
        <p className="mt-2 text-sm text-slate-600">
          Assets {formatAmount(bs.totalAssets, cur)} ={" "}
          Liabilities {formatAmount(bs.totalLiabilities, cur)} + Equity{" "}
          {formatAmount(bs.totalEquity, cur)}.{" "}
          <span
            className={bs.balanced ? "text-emerald-600" : "text-red-600"}
          >
            {bs.balanced ? "Balanced ✓" : "Out of balance ✗"}
          </span>
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone = "default",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "default" | "positive" | "danger";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-red-600"
        : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-2 text-xl font-semibold ${color}`}>
        {value} <span className="text-sm font-normal text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

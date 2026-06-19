import Link from "next/link";

const REPORTS = [
  {
    href: "/reports/balance-sheet",
    title: "Balance Sheet",
    desc: "Assets, liabilities and equity as of a date.",
  },
  {
    href: "/reports/profit-loss",
    title: "Profit & Loss",
    desc: "Income and expenses over a period.",
  },
  {
    href: "/reports/trial-balance",
    title: "Trial Balance",
    desc: "Every account's debit and credit totals.",
  },
];

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-slate-500">Financial statements from your ledger.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <div className="font-medium text-slate-900">{r.title}</div>
            <div className="mt-1 text-sm text-slate-500">{r.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listPayments, paymentStats } from "@/lib/documents";
import { formatAmount } from "@/lib/money";

import PaymentsTable, { type PaymentRow } from "./payments-table";

function relativeDays(date: Date, locale: string): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diff = Math.round((a - b) / dayMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diff) >= 365) return rtf.format(Math.round(diff / 365), "year");
  if (Math.abs(diff) >= 30) return rtf.format(Math.round(diff / 30), "month");
  return rtf.format(diff, "day");
}

export default async function PaymentsPage() {
  const ctx = await requireContext();
  const t = await getTranslations("payments");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const [payments, stats] = await Promise.all([
    listPayments(ctx.orgId),
    paymentStats(ctx.orgId),
  ]);

  const rows: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    number: p.number,
    date: p.date.toISOString().slice(0, 10),
    party: p.party?.name ?? "—",
    from: p.bankAccount.name,
    amount: formatAmount(p.total, cur),
  }));

  const latest = stats.latestDate
    ? `${stats.latestDate.toISOString().slice(0, 10)}`
    : t("noPaymentsYet");
  const latestSub = stats.latestDate ? relativeDays(stats.latestDate, locale) : "—";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("title")}</h1>
          <p className="text-sm text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/payments/new?kind=expense"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300"
          >
            {t("newExpense")}
          </Link>
          <Link href="/payments/new" className="btn-brand">
            <span aria-hidden>+</span> {t("new")}
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="emerald"
          label={t("totalPayments")}
          value={String(stats.monthCount)}
          sub={tc("thisMonth")}
          icon={
            <path d="M4 5.5A1.5 1.5 0 015.5 4h9A1.5 1.5 0 0116 5.5v11l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L4 16.5v-11z" />
          }
        />
        <StatCard
          tone="blue"
          label={t("totalAmountStat")}
          value={formatAmount(stats.monthSum, cur)}
          unit={cur}
          sub={tc("thisMonth")}
          icon={<path d="M3 14l4-4 3 3 7-7v4M17 6h-4" />}
          strokeIcon
        />
        <StatCard
          tone="violet"
          label={t("averagePayment")}
          value={formatAmount(stats.monthAvg, cur)}
          unit={cur}
          sub={tc("thisMonth")}
          icon={
            <path d="M6 3.5h6.2L16 7.3V16a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 014 16V5A1.5 1.5 0 015.5 3.5H6zm6 0V7h3.5M7 11h6M7 13.5h6" />
          }
          strokeIcon
        />
        <StatCard
          tone="amber"
          label={t("latestPayment")}
          value={latest}
          sub={latestSub}
          icon={
            <path d="M6 3v2m8-2v2M4.5 6.5h11A1.5 1.5 0 0117 8v7.5A1.5 1.5 0 0115.5 17h-11A1.5 1.5 0 013 15.5V8a1.5 1.5 0 011.5-1.5z" />
          }
          strokeIcon
        />
      </div>

      <div className="mt-8">
        <PaymentsTable rows={rows} currency={cur} />
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
};

function StatCard({
  tone,
  label,
  value,
  unit,
  sub,
  icon,
  strokeIcon,
}: {
  tone: keyof typeof TONES | string;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  icon: React.ReactNode;
  strokeIcon?: boolean;
}) {
  return (
    <div className="card-surface flex items-start gap-4 p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONES[tone] ?? TONES.emerald}`}>
        <svg
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill={strokeIcon ? "none" : "currentColor"}
          stroke={strokeIcon ? "currentColor" : "none"}
          strokeWidth={strokeIcon ? 1.6 : 0}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {icon}
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
        <p className="mt-1 truncate text-xl font-bold tracking-tight text-slate-900">
          {value}
          {unit ? <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span> : null}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

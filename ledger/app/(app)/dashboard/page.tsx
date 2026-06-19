import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { formatAmount } from "@/lib/money";
import { balanceSheet, profitAndLoss } from "@/lib/reports";
import { getSidebarCounts } from "@/lib/sidebar";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const tn = await getTranslations("nav");
  const cur = ctx.baseCurrency;
  const firstName = ctx.userName.split(/\s+/)[0] ?? ctx.userName;

  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t("greetingMorning", { name: firstName })
      : hour < 17
        ? t("greetingAfternoon", { name: firstName })
        : t("greetingEvening", { name: firstName });

  const categories = [
    { label: t("categoryAccounting"), href: "/reports", emoji: "📊" },
    { label: t("categoryExpenses"), href: "/payments", emoji: "💳" },
    { label: t("categorySales"), href: "/sales-invoices", emoji: "💰" },
    { label: t("categoryCustomers"), href: "/customers", emoji: "👥" },
    { label: t("categoryInventory"), href: "/inventory-items", emoji: "📦" },
    { label: t("categoryPurchases"), href: "/purchase-invoices", emoji: "🛒" },
  ];

  const createActions = [
    { label: t("addCustomer"), href: "/customers" },
    { label: t("createInvoice"), href: "/sales-invoices/new" },
    { label: t("recordReceipt"), href: "/receipts/new" },
    { label: t("recordPayment"), href: "/payments/new" },
    { label: t("addSupplier"), href: "/suppliers" },
    { label: t("journalEntry"), href: "/journal/new" },
  ];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [bs, pnl, counts] = await Promise.all([
    balanceSheet(ctx.orgId),
    profitAndLoss(ctx.orgId, monthStart, monthEnd),
    getSidebarCounts(ctx.orgId),
  ]);

  const incomeNum = Number(pnl.totalIncome);
  const expenseNum = Number(pnl.totalExpenses);
  const barTotal = Math.max(incomeNum + expenseNum, 1);
  const incomePct = Math.round((incomeNum / barTotal) * 100);
  const expensePct = 100 - incomePct;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
        {greeting}
      </h1>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => (
          <Link key={c.href} href={c.href} className="pill-category">
            <span aria-hidden>{c.emoji}</span>
            {c.label}
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">{t("createActions")}</h2>
          <Link href="/receipts/new" className="text-sm font-medium text-[var(--brand)] hover:underline">
            {tc("showAll")}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {createActions.map((a) => (
            <Link key={a.href} href={a.href} className="pill-action">
              <span className="text-[var(--brand)]">+</span>
              {a.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t("glanceTitle")}</h2>
          <span className="text-xs text-[var(--muted)]">{tc("thisMonth")}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Widget title={t("profitLoss")}>
            <p className="text-xs text-[var(--muted)]">{t("netProfitMonth")}</p>
            <p
              className={`mt-1 text-3xl font-bold tracking-tight ${
                pnl.netProfit >= 0n ? "text-slate-900" : "text-red-600"
              }`}
            >
              {formatAmount(pnl.netProfit, cur)}{" "}
              <span className="text-lg font-normal text-slate-400">{cur}</span>
            </p>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="bg-[var(--brand)]" style={{ width: `${incomePct}%` }} title={t("income")} />
              <div className="bg-slate-400" style={{ width: `${expensePct}%` }} title={t("expenses")} />
            </div>
            <div className="mt-3 flex justify-between text-xs text-[var(--muted)]">
              <span>
                {t("income")} {formatAmount(pnl.totalIncome, cur)}
              </span>
              <span>
                {t("expenses")} {formatAmount(pnl.totalExpenses, cur)}
              </span>
            </div>
          </Widget>

          <Widget title={t("balanceSheet")}>
            <div className="space-y-4">
              <MetricRow label={t("totalAssets")} value={formatAmount(bs.totalAssets, cur)} unit={cur} />
              <MetricRow
                label={t("totalLiabilities")}
                value={formatAmount(bs.totalLiabilities, cur)}
                unit={cur}
              />
              <MetricRow label={t("equity")} value={formatAmount(bs.totalEquity, cur)} unit={cur} />
            </div>
            <p className="mt-4 text-sm">
              <span className={bs.balanced ? "text-[var(--brand)]" : "text-red-600"}>
                {bs.balanced ? t("balanced") : t("unbalanced")}
              </span>
            </p>
          </Widget>

          <Widget title={t("activity")}>
            <div className="grid grid-cols-2 gap-3">
              <CountPill label={tn("customers")} value={counts["/customers"] ?? 0} />
              <CountPill label={tn("receipts")} value={counts["/receipts"] ?? 0} />
              <CountPill label={tn("payments")} value={counts["/payments"] ?? 0} />
              <CountPill label={t("invoices")} value={counts["/sales-invoices"] ?? 0} />
            </div>
            <Link
              href="/reports/profit-loss"
              className="mt-4 inline-block text-sm font-medium text-[var(--brand)] hover:underline"
            >
              {t("viewReports")}
            </Link>
          </Widget>
        </div>
      </section>
    </div>
  );
}

function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-surface p-5 md:p-6">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-3 last:border-0">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="text-sm font-semibold text-slate-900">
        {value} <span className="font-normal text-slate-400">{unit}</span>
      </span>
    </div>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}

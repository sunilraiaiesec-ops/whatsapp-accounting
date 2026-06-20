import Link from "next/link";
import { getTranslations } from "next-intl/server";

type ReportItem = {
  href: string;
  titleKey: string;
  descKey: string;
};

type ReportCategory = {
  titleKey: string;
  reports: ReportItem[];
};

const CATEGORIES: ReportCategory[] = [
  {
    titleKey: "financialStatements",
    reports: [
      { href: "/reports/balance-sheet", titleKey: "balanceSheet", descKey: "balanceSheetDesc" },
      { href: "/reports/profit-loss", titleKey: "profitLoss", descKey: "profitLossDesc" },
      { href: "/reports/trial-balance", titleKey: "trialBalance", descKey: "trialBalanceDesc" },
      { href: "/reports/cash-summary", titleKey: "cashSummary", descKey: "cashSummaryDesc" },
    ],
  },
  {
    titleKey: "whoOwesYou",
    reports: [
      { href: "/reports/customer-balances", titleKey: "customerBalances", descKey: "customerBalancesDesc" },
      { href: "/reports/ar-aging", titleKey: "arAging", descKey: "arAgingDesc" },
    ],
  },
  {
    titleKey: "whatYouOwe",
    reports: [
      { href: "/reports/supplier-balances", titleKey: "supplierBalances", descKey: "supplierBalancesDesc" },
      { href: "/reports/ap-aging", titleKey: "apAging", descKey: "apAgingDesc" },
    ],
  },
  {
    titleKey: "accountant",
    reports: [
      { href: "/reports/general-ledger", titleKey: "generalLedger", descKey: "generalLedgerDesc" },
      { href: "/journal", titleKey: "journal", descKey: "journalDesc" },
      { href: "/accounts", titleKey: "chartOfAccounts", descKey: "chartOfAccountsDesc" },
    ],
  },
  {
    titleKey: "inventory",
    reports: [
      { href: "/reports/inventory-valuation", titleKey: "inventoryValuation", descKey: "inventoryValuationDesc" },
    ],
  },
];

export default async function ReportsPage() {
  const t = await getTranslations("reportsPage");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("subtitle")}</p>

      <div className="mt-8 space-y-8">
        {CATEGORIES.map((category) => (
          <section key={category.titleKey}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t(category.titleKey)}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {category.reports.map((report) => (
                <Link
                  key={report.href}
                  href={report.href}
                  className="card-surface block p-4 transition hover:border-[var(--brand)]/30 hover:shadow-md"
                >
                  <div className="font-medium text-slate-900">{t(report.titleKey)}</div>
                  <div className="mt-1 text-sm text-[var(--muted)]">{t(report.descKey)}</div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

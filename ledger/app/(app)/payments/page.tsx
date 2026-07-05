import { getLocale, getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listPayments, docMonthStats } from "@/lib/documents";
import { formatAmount } from "@/lib/money";
import { relativeDays, isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function PaymentsPage() {
  const ctx = await requireContext();
  const t = await getTranslations("payments");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const [payments, stats] = await Promise.all([
    listPayments(ctx.orgId),
    docMonthStats(ctx.orgId, "payment"),
  ]);

  const rows: ListRow[] = payments.map((p) => ({
    id: p.id,
    href: `/payments/${p.id}`,
    _date: isoDate(p.date),
    number: p.number,
    date: isoDate(p.date),
    party:
      p.party?.name ??
      p.description ??
      p.lines.find((l) => l.memo)?.memo ??
      p.lines[0]?.account.name ??
      "—",
    from: p.bankAccount.name,
    amount: formatAmount(p.total, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actionHref="/payments/new" actionLabel={t("new")} />

      <StatGrid>
        <StatCard icon="out" tone="rose" label={t("totalPayments")} value={String(stats.count)} sub={tc("thisMonth")} />
        <StatCard icon="sum" tone="blue" label={t("totalAmountStat")} value={formatAmount(stats.sum, cur)} unit={cur} sub={tc("thisMonth")} />
        <StatCard icon="avg" tone="violet" label={t("averagePayment")} value={formatAmount(stats.avg, cur)} unit={cur} sub={tc("thisMonth")} />
        <StatCard
          icon="calendar"
          tone="amber"
          label={t("latestPayment")}
          value={stats.latest ? isoDate(stats.latest) : t("noPaymentsYet")}
          sub={stats.latest ? relativeDays(stats.latest, locale) : undefined}
        />
      </StatGrid>

      <div className="mt-8">
        <ListView
          rows={rows}
          currency={cur}
          hasDateFilter
          searchKeys={["number", "party", "from"]}
          searchPlaceholder={t("searchPlaceholder")}
          emptyText={t("empty")}
          mobile={{ title: "party", subtitle: "number", amount: "amount" }}
          columns={[
            { key: "number", header: t("number"), kind: "link" },
            { key: "date", header: t("dateColumn"), kind: "muted" },
            { key: "party", header: t("paidTo") },
            { key: "from", header: t("from"), kind: "muted" },
            { key: "amount", header: t("amount"), kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}

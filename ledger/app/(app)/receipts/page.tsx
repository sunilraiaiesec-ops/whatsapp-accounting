import { getLocale, getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listReceipts, docMonthStats } from "@/lib/documents";
import { formatAmount } from "@/lib/money";
import { relativeDays, isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function ReceiptsPage() {
  const ctx = await requireContext();
  const t = await getTranslations("receipts");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const [receipts, stats] = await Promise.all([
    listReceipts(ctx.orgId),
    docMonthStats(ctx.orgId, "receipt"),
  ]);

  const rows: ListRow[] = receipts.map((r) => ({
    id: r.id,
    href: `/receipts/${r.id}`,
    _date: isoDate(r.date),
    number: r.number,
    date: isoDate(r.date),
    party: r.party?.name ?? "—",
    into: r.bankAccount.name,
    amount: formatAmount(r.total, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actionHref="/receipts/new" actionLabel={t("new")} />

      <StatGrid>
        <StatCard icon="in" tone="emerald" label={t("title")} value={String(stats.count)} sub={tc("thisMonth")} />
        <StatCard icon="sum" tone="blue" label={tc("amountTotal")} value={formatAmount(stats.sum, cur)} unit={cur} sub={tc("thisMonth")} />
        <StatCard icon="avg" tone="violet" label={tc("average")} value={formatAmount(stats.avg, cur)} unit={cur} sub={tc("thisMonth")} />
        <StatCard icon="calendar" tone="amber" label={tc("latest")} value={stats.latest ? isoDate(stats.latest) : "—"} sub={stats.latest ? relativeDays(stats.latest, locale) : undefined} />
      </StatGrid>

      <div className="mt-8">
        <ListView
          rows={rows}
          currency={cur}
          hasDateFilter
          searchKeys={["number", "party", "into"]}
          emptyText={t("empty")}
          mobile={{ title: "party", subtitle: "number", amount: "amount" }}
          columns={[
            { key: "number", header: t("number"), kind: "link" },
            { key: "date", header: t("dateColumn"), kind: "muted" },
            { key: "party", header: t("receivedFrom") },
            { key: "into", header: t("into"), kind: "muted" },
            { key: "amount", header: t("amount"), kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}

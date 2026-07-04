import { getLocale } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { docMonthStats, listRefundReceipts } from "@/lib/documents";
import { formatAmount } from "@/lib/money";
import { relativeDays, isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function RefundReceiptsPage() {
  const ctx = await requireContext();
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const [refunds, stats] = await Promise.all([
    listRefundReceipts(ctx.orgId),
    docMonthStats(ctx.orgId, "refundReceipt"),
  ]);

  const rows: ListRow[] = refunds.map((r) => ({
    id: r.id,
    href: `/refund-receipts/${r.id}`,
    _date: isoDate(r.date),
    number: r.number,
    date: isoDate(r.date),
    party: r.party?.name ?? "Walk-in",
    account: r.bankAccount.name,
    amount: formatAmount(r.total, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Refund receipts"
        subtitle="Money refunded to customers for returns or overpayments."
        actionHref="/refund-receipts/new"
        actionLabel="New refund"
      />

      <StatGrid>
        <StatCard icon="box" tone="rose" label="Refunds" value={String(stats.count)} sub="This month" />
        <StatCard icon="sum" tone="blue" label="Total refunded" value={formatAmount(stats.sum, cur)} unit={cur} sub="This month" />
        <StatCard icon="avg" tone="violet" label="Average" value={formatAmount(stats.avg, cur)} unit={cur} sub="This month" />
        <StatCard icon="calendar" tone="amber" label="Latest" value={stats.latest ? isoDate(stats.latest) : "—"} sub={stats.latest ? relativeDays(stats.latest, locale) : undefined} />
      </StatGrid>

      <div className="mt-8">
        <ListView
          rows={rows}
          currency={cur}
          hasDateFilter
          searchKeys={["number", "party", "account"]}
          emptyText="No refunds yet."
          mobile={{ title: "party", subtitle: "number", amount: "amount" }}
          columns={[
            { key: "number", header: "Number", kind: "link" },
            { key: "date", header: "Date", kind: "muted" },
            { key: "party", header: "Customer" },
            { key: "account", header: "Paid from", kind: "muted" },
            { key: "amount", header: "Amount", kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}

import { getLocale } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listInterAccountTransfers, docMonthStats } from "@/lib/documents";
import { formatAmount } from "@/lib/money";
import { relativeDays, isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function InterAccountTransfersPage() {
  const ctx = await requireContext();
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const [transfers, stats] = await Promise.all([
    listInterAccountTransfers(ctx.orgId),
    docMonthStats(ctx.orgId, "interAccountTransfer"),
  ]);

  const rows: ListRow[] = transfers.map((tr) => ({
    id: tr.id,
    href: `/inter-account-transfers/${tr.id}`,
    _date: isoDate(tr.date),
    number: tr.number,
    date: isoDate(tr.date),
    from: tr.fromAccount.name,
    to: tr.toAccount.name,
    amount: formatAmount(tr.amount, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inter-account transfers"
        subtitle="Move money between your bank and cash accounts."
        actionHref="/inter-account-transfers/new"
        actionLabel="New transfer"
      />

      <StatGrid>
        <StatCard icon="transfer" tone="slate" label="Transfers" value={String(stats.count)} sub="This month" />
        <StatCard icon="sum" tone="blue" label="Total moved" value={formatAmount(stats.sum, cur)} unit={cur} sub="This month" />
        <StatCard icon="avg" tone="violet" label="Average" value={formatAmount(stats.avg, cur)} unit={cur} sub="This month" />
        <StatCard icon="calendar" tone="amber" label="Latest" value={stats.latest ? isoDate(stats.latest) : "—"} sub={stats.latest ? relativeDays(stats.latest, locale) : undefined} />
      </StatGrid>

      <div className="mt-8">
        <ListView
          rows={rows}
          currency={cur}
          hasDateFilter
          searchKeys={["number", "from", "to"]}
          emptyText="No transfers yet."
          mobile={{ title: "to", subtitle: "number", amount: "amount" }}
          columns={[
            { key: "number", header: "Number", kind: "link" },
            { key: "date", header: "Date", kind: "muted" },
            { key: "from", header: "From" },
            { key: "to", header: "To" },
            { key: "amount", header: "Amount", kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}

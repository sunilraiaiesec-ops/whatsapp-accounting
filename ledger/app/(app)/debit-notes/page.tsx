import { getLocale } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listDebitNotes, docMonthStats } from "@/lib/documents";
import { formatAmount } from "@/lib/money";
import { relativeDays, isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function DebitNotesPage() {
  const ctx = await requireContext();
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const [notes, stats] = await Promise.all([
    listDebitNotes(ctx.orgId),
    docMonthStats(ctx.orgId, "debitNote"),
  ]);

  const rows: ListRow[] = notes.map((n) => ({
    id: n.id,
    href: `/debit-notes/${n.id}`,
    _date: isoDate(n.date),
    number: n.number,
    date: isoDate(n.date),
    supplier: n.party.name,
    amount: formatAmount(n.total, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Debit notes"
        subtitle="Returns to suppliers — reduce Accounts payable."
        actionHref="/debit-notes/new"
        actionLabel="New debit note"
      />

      <StatGrid>
        <StatCard icon="doc" tone="rose" label="Debit notes" value={String(stats.count)} sub="This month" />
        <StatCard icon="sum" tone="blue" label="Total amount" value={formatAmount(stats.sum, cur)} unit={cur} sub="This month" />
        <StatCard icon="avg" tone="violet" label="Average" value={formatAmount(stats.avg, cur)} unit={cur} sub="This month" />
        <StatCard icon="calendar" tone="amber" label="Latest" value={stats.latest ? isoDate(stats.latest) : "—"} sub={stats.latest ? relativeDays(stats.latest, locale) : undefined} />
      </StatGrid>

      <div className="mt-8">
        <ListView
          rows={rows}
          currency={cur}
          hasDateFilter
          searchKeys={["number", "supplier"]}
          emptyText="No debit notes yet."
          mobile={{ title: "supplier", subtitle: "number", amount: "amount" }}
          columns={[
            { key: "number", header: "Number", kind: "link" },
            { key: "date", header: "Date", kind: "muted" },
            { key: "supplier", header: "Supplier" },
            { key: "amount", header: "Amount", kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}

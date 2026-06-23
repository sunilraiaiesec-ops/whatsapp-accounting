import { getLocale } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { docMonthStats } from "@/lib/documents";
import { listInventoryWriteOffs } from "@/lib/inventory";
import { formatAmount } from "@/lib/money";
import { relativeDays, isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function InventoryWriteOffsPage() {
  const ctx = await requireContext();
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const [writeOffs, stats] = await Promise.all([
    listInventoryWriteOffs(ctx.orgId),
    docMonthStats(ctx.orgId, "inventoryWriteOff"),
  ]);

  const rows: ListRow[] = writeOffs.map((w) => ({
    id: w.id,
    href: `/inventory-write-offs/${w.id}`,
    _date: isoDate(w.date),
    number: w.number,
    date: isoDate(w.date),
    account: w.expenseAccount.name,
    amount: formatAmount(w.total, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inventory write-offs"
        subtitle="Damaged, lost, or expired stock — removed at average cost."
        actionHref="/inventory-write-offs/new"
        actionLabel="New write-off"
      />

      <StatGrid>
        <StatCard icon="box" tone="rose" label="Write-offs" value={String(stats.count)} sub="This month" />
        <StatCard icon="sum" tone="blue" label="Total value" value={formatAmount(stats.sum, cur)} unit={cur} sub="This month" />
        <StatCard icon="avg" tone="violet" label="Average" value={formatAmount(stats.avg, cur)} unit={cur} sub="This month" />
        <StatCard icon="calendar" tone="amber" label="Latest" value={stats.latest ? isoDate(stats.latest) : "—"} sub={stats.latest ? relativeDays(stats.latest, locale) : undefined} />
      </StatGrid>

      <div className="mt-8">
        <ListView
          rows={rows}
          currency={cur}
          hasDateFilter
          searchKeys={["number", "account"]}
          emptyText="No write-offs yet."
          mobile={{ title: "account", subtitle: "number", amount: "amount" }}
          columns={[
            { key: "number", header: "Number", kind: "link" },
            { key: "date", header: "Date", kind: "muted" },
            { key: "account", header: "Expense account" },
            { key: "amount", header: "Value", kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}

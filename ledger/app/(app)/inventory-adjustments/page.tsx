import { getLocale } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { docMonthStats } from "@/lib/documents";
import { listInventoryAdjustments } from "@/lib/inventory";
import { formatAmount } from "@/lib/money";
import { relativeDays, isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function InventoryAdjustmentsPage() {
  const ctx = await requireContext();
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const [adjustments, stats] = await Promise.all([
    listInventoryAdjustments(ctx.orgId),
    docMonthStats(ctx.orgId, "inventoryAdjustment"),
  ]);

  const rows: ListRow[] = adjustments.map((a) => ({
    id: a.id,
    href: `/inventory-adjustments/${a.id}`,
    _date: isoDate(a.date),
    number: a.number,
    date: isoDate(a.date),
    account: a.adjustmentAccount.name,
    amount: formatAmount(a.total, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inventory adjustments"
        subtitle="Correct stock counts up or down after a physical count."
        actionHref="/inventory-adjustments/new"
        actionLabel="New adjustment"
      />

      <StatGrid>
        <StatCard icon="box" tone="violet" label="Adjustments" value={String(stats.count)} sub="This month" />
        <StatCard icon="sum" tone="blue" label="Net value change" value={formatAmount(stats.sum, cur)} unit={cur} sub="This month" />
        <StatCard icon="avg" tone="rose" label="Average" value={formatAmount(stats.avg, cur)} unit={cur} sub="This month" />
        <StatCard icon="calendar" tone="amber" label="Latest" value={stats.latest ? isoDate(stats.latest) : "—"} sub={stats.latest ? relativeDays(stats.latest, locale) : undefined} />
      </StatGrid>

      <div className="mt-8">
        <ListView
          rows={rows}
          currency={cur}
          hasDateFilter
          searchKeys={["number", "account"]}
          emptyText="No inventory adjustments yet."
          mobile={{ title: "account", subtitle: "number", amount: "amount" }}
          columns={[
            { key: "number", header: "Number", kind: "link" },
            { key: "date", header: "Date", kind: "muted" },
            { key: "account", header: "Adjustment account" },
            { key: "amount", header: "Net value", kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}

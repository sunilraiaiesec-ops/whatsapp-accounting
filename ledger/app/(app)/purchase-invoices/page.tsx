import { getLocale } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listPurchaseInvoices, docMonthStats } from "@/lib/documents";
import { formatAmount } from "@/lib/money";
import { relativeDays, isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function PurchaseInvoicesPage() {
  const ctx = await requireContext();
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const [invoices, stats] = await Promise.all([
    listPurchaseInvoices(ctx.orgId),
    docMonthStats(ctx.orgId, "purchaseInvoice"),
  ]);

  const rows: ListRow[] = invoices.map((inv) => ({
    id: inv.id,
    href: `/purchase-invoices/${inv.id}`,
    _date: isoDate(inv.date),
    number: inv.number,
    date: isoDate(inv.date),
    supplier: inv.party.name,
    due: inv.dueDate ? isoDate(inv.dueDate) : "—",
    status: inv.status,
    amount: formatAmount(inv.total, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Purchase invoices"
        subtitle="Bills from suppliers, on credit (Accounts payable)."
        actionHref="/purchase-invoices/new"
        actionLabel="New purchase invoice"
      />

      <StatGrid>
        <StatCard icon="doc" tone="rose" label="Bills" value={String(stats.count)} sub="This month" />
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
          emptyText="No purchase invoices yet."
          mobile={{ title: "supplier", subtitle: "number", amount: "amount", status: "status" }}
          columns={[
            { key: "number", header: "Number", kind: "link" },
            { key: "date", header: "Date", kind: "muted" },
            { key: "supplier", header: "Supplier" },
            { key: "due", header: "Due", kind: "muted" },
            { key: "status", header: "Status", kind: "status" },
            { key: "amount", header: "Amount", kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}

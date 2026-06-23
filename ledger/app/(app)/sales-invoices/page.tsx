import { getLocale, getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listSalesInvoices, docMonthStats } from "@/lib/documents";
import { formatAmount } from "@/lib/money";
import { relativeDays, isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function SalesInvoicesPage() {
  const ctx = await requireContext();
  const t = await getTranslations("salesInvoices");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const [invoices, stats] = await Promise.all([
    listSalesInvoices(ctx.orgId),
    docMonthStats(ctx.orgId, "salesInvoice"),
  ]);

  const rows: ListRow[] = invoices.map((inv) => ({
    id: inv.id,
    href: `/sales-invoices/${inv.id}`,
    _date: isoDate(inv.date),
    number: inv.number,
    date: isoDate(inv.date),
    customer: inv.party.name,
    due: inv.dueDate ? isoDate(inv.dueDate) : "—",
    status: inv.status,
    amount: formatAmount(inv.total, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actionHref="/sales-invoices/new" actionLabel={t("new")} />

      <StatGrid>
        <StatCard icon="doc" tone="emerald" label={t("title")} value={String(stats.count)} sub={tc("thisMonth")} />
        <StatCard icon="sum" tone="blue" label={tc("amountTotal")} value={formatAmount(stats.sum, cur)} unit={cur} sub={tc("thisMonth")} />
        <StatCard icon="avg" tone="violet" label={tc("average")} value={formatAmount(stats.avg, cur)} unit={cur} sub={tc("thisMonth")} />
        <StatCard icon="calendar" tone="amber" label={tc("latest")} value={stats.latest ? isoDate(stats.latest) : "—"} sub={stats.latest ? relativeDays(stats.latest, locale) : undefined} />
      </StatGrid>

      <div className="mt-8">
        <ListView
          rows={rows}
          currency={cur}
          hasDateFilter
          searchKeys={["number", "customer"]}
          emptyText={t("emptyTitle")}
          mobile={{ title: "customer", subtitle: "number", amount: "amount", status: "status" }}
          columns={[
            { key: "number", header: t("number"), kind: "link" },
            { key: "date", header: tc("date"), kind: "muted" },
            { key: "customer", header: t("customer") },
            { key: "due", header: t("due"), kind: "muted" },
            { key: "status", header: t("status"), kind: "status" },
            { key: "amount", header: tc("total"), kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}

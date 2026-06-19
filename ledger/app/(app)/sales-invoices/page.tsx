import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listSalesInvoices } from "@/lib/documents";
import { formatAmount } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/ui/PageHeader";

export default async function SalesInvoicesPage() {
  const ctx = await requireContext();
  const t = await getTranslations("salesInvoices");
  const tc = await getTranslations("common");
  const cur = ctx.baseCurrency;
  const invoices = await listSalesInvoices(ctx.orgId);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actionHref="/sales-invoices/new"
        actionLabel={t("new")}
      />

      {invoices.length === 0 ? (
        <div className="card-surface p-12 text-center">
          <p className="text-lg font-medium text-slate-800">{t("emptyTitle")}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{t("emptySubtitle")}</p>
          <Link href="/sales-invoices/new" className="btn-brand mt-6 inline-flex">
            + {t("emptyAction")}
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/sales-invoices/${inv.id}`}
                className="card-surface block p-4 transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{inv.party.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
                      {inv.number}
                    </p>
                  </div>
                  <StatusBadge status={inv.status} />
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <p className="text-xs text-[var(--muted)]">
                    {inv.date.toISOString().slice(0, 10)}
                    {inv.dueDate
                      ? ` · ${t("due")} ${inv.dueDate.toISOString().slice(0, 10)}`
                      : ""}
                  </p>
                  <p className="text-lg font-bold tabular-nums text-slate-900">
                    {formatAmount(inv.total, cur)}{" "}
                    <span className="text-sm font-normal text-slate-400">{cur}</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>

          <div className="card-surface hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-5 py-3">{t("number")}</th>
                    <th className="px-5 py-3">{tc("date")}</th>
                    <th className="px-5 py-3">{t("customer")}</th>
                    <th className="px-5 py-3">{t("due")}</th>
                    <th className="px-5 py-3">{t("status")}</th>
                    <th className="px-5 py-3 text-right">{tc("total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-100 last:border-0 transition hover:bg-slate-50/80"
                    >
                      <td className="px-5 py-3 font-mono text-xs">
                        <Link
                          href={`/sales-invoices/${inv.id}`}
                          className="font-semibold text-[var(--brand)] hover:underline"
                        >
                          {inv.number}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {inv.date.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {inv.party.name}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatAmount(inv.total, cur)}{" "}
                        <span className="font-normal text-slate-400">{cur}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

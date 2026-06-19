import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getSalesInvoice } from "@/lib/documents";
import { cloneSalesInvoiceAction } from "@/app/actions/documents";
import { formatAmount } from "@/lib/money";
import { DocToolbar } from "@/components/DocToolbar";
import { TransactionJournal } from "@/components/TransactionJournal";
import { StatusBadge } from "@/components/ui/PageHeader";

export default async function SalesInvoiceViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const data = await getSalesInvoice(ctx.orgId, id);
  if (!data) notFound();
  const { invoice, entry, nav } = data;

  const cogs = invoice.lines.reduce((s, l) => s + l.cost, 0n);
  const profit = invoice.total - cogs;

  return (
    <div className="mx-auto max-w-3xl">
      <DocToolbar
        listHref="/sales-invoices"
        listLabel="Sales Invoices"
        id={invoice.id}
        editHref={`/sales-invoices/${invoice.id}/edit`}
        cloneAction={cloneSalesInvoiceAction}
        prevHref={nav.prevId ? `/sales-invoices/${nav.prevId}` : null}
        nextHref={nav.nextId ? `/sales-invoices/${nav.nextId}` : null}
        index={nav.index}
        total={nav.total}
      />

      <article className="card-surface overflow-hidden print:border-0 print:shadow-none">
        {/* Header band */}
        <div className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--brand)]/5 to-transparent px-6 py-8 sm:px-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--brand)]">
                Sales Invoice
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
                {invoice.party.name}
              </h1>
              {invoice.reference ? (
                <p className="mt-1 text-sm text-[var(--muted)]">Ref: {invoice.reference}</p>
              ) : null}
              <div className="mt-3">
                <StatusBadge status={invoice.status} />
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-semibold text-slate-900">{ctx.orgName}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex gap-4 sm:block">
                  <dt className="text-[var(--muted)] sm:mb-0.5">Invoice #</dt>
                  <dd className="font-mono font-semibold text-slate-900">{invoice.number}</dd>
                </div>
                <div className="flex gap-4 sm:block">
                  <dt className="text-[var(--muted)] sm:mb-0.5">Date</dt>
                  <dd className="text-slate-900">{invoice.date.toISOString().slice(0, 10)}</dd>
                </div>
                {invoice.dueDate ? (
                  <div className="flex gap-4 sm:block">
                    <dt className="text-[var(--muted)] sm:mb-0.5">Due</dt>
                    <dd className="text-slate-900">
                      {invoice.dueDate.toISOString().slice(0, 10)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="px-6 py-6 sm:px-10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <th className="pb-3 pr-4">Description</th>
                  <th className="w-20 pb-3 pr-4 text-right">Qty</th>
                  <th className="w-28 pb-3 pr-4 text-right">Unit price</th>
                  <th className="w-32 pb-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 text-slate-800">{l.description}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-700">
                      {l.quantity.toString()}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-700">
                      {formatAmount(l.unitPrice, cur)}
                    </td>
                    <td className="py-3 text-right font-medium tabular-nums text-slate-900">
                      {formatAmount(l.lineTotal, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:justify-end">
            {cogs > 0n ? (
              <div className="w-full space-y-2 text-sm sm:w-56">
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Revenue</span>
                  <span className="tabular-nums">{formatAmount(invoice.total, cur)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Cost of goods sold</span>
                  <span className="tabular-nums">({formatAmount(cogs, cur)})</span>
                </div>
                <div className="flex justify-between border-t border-[var(--border)] pt-2 font-semibold">
                  <span>Gross profit</span>
                  <span className="tabular-nums">
                    {formatAmount(profit, cur)} {cur}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl bg-slate-50 px-6 py-4 text-right sm:min-w-[220px]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Total due
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {formatAmount(invoice.total, cur)}
              </p>
              <p className="text-sm text-slate-400">{cur}</p>
            </div>
          </div>

          {invoice.notes ? (
            <div className="mt-8 rounded-xl border border-[var(--border)] bg-slate-50/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Notes
              </p>
              <p className="mt-1 text-sm text-slate-700">{invoice.notes}</p>
            </div>
          ) : null}
        </div>
      </article>

      {entry ? <TransactionJournal lines={entry.lines} currency={cur} /> : null}
    </div>
  );
}

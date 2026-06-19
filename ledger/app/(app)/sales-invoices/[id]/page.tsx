import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getSalesInvoice } from "@/lib/documents";
import { cloneSalesInvoiceAction } from "@/app/actions/documents";
import { formatAmount } from "@/lib/money";
import { DocToolbar } from "@/components/DocToolbar";
import { TransactionJournal } from "@/components/TransactionJournal";

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

      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Sales Invoice</h1>
            <p className="mt-1 text-lg text-slate-700">{invoice.party.name}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-slate-900">{ctx.orgName}</div>
            <div className="mt-2 text-slate-500">Invoice</div>
            <div className="text-slate-900">{invoice.number}</div>
            <div className="mt-2 text-slate-500">Date</div>
            <div className="text-slate-900">
              {invoice.date.toISOString().slice(0, 10)}
            </div>
            {invoice.dueDate ? (
              <>
                <div className="mt-2 text-slate-500">Due</div>
                <div className="text-slate-900">
                  {invoice.dueDate.toISOString().slice(0, 10)}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <table className="mt-6 w-full border border-slate-300 text-sm">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="w-20 px-4 py-2 text-right font-semibold">Qty</th>
              <th className="w-32 px-4 py-2 text-right font-semibold">Unit price</th>
              <th className="w-36 px-4 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-200">
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {l.quantity.toString()}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(l.unitPrice, cur)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(l.lineTotal, cur)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-4 py-2 text-right" colSpan={3}>
                Total
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(invoice.total, cur)} {cur}
              </td>
            </tr>
          </tfoot>
        </table>

        {invoice.notes ? (
          <p className="mt-4 text-sm text-slate-500">{invoice.notes}</p>
        ) : null}

        {(() => {
          const cogs = invoice.lines.reduce((s, l) => s + l.cost, 0n);
          if (cogs <= 0n) return null;
          const profit = invoice.total - cogs;
          return (
            <div className="mt-6 ml-auto w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Revenue</span>
                <span className="tabular-nums">{formatAmount(invoice.total, cur)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cost of goods sold</span>
                <span className="tabular-nums">({formatAmount(cogs, cur)})</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                <span>Gross profit</span>
                <span className="tabular-nums">
                  {formatAmount(profit, cur)} {cur}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {entry ? <TransactionJournal lines={entry.lines} currency={cur} /> : null}
    </div>
  );
}

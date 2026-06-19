import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getPurchaseInvoice } from "@/lib/documents";
import { clonePurchaseInvoiceAction } from "@/app/actions/documents";
import { formatAmount } from "@/lib/money";
import { DocToolbar } from "@/components/DocToolbar";
import { TransactionJournal } from "@/components/TransactionJournal";

export default async function PurchaseInvoiceViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const data = await getPurchaseInvoice(ctx.orgId, id);
  if (!data) notFound();
  const { invoice, entry, nav } = data;

  return (
    <div className="mx-auto max-w-3xl">
      <DocToolbar
        listHref="/purchase-invoices"
        listLabel="Purchase Invoices"
        id={invoice.id}
        editHref={`/purchase-invoices/${invoice.id}/edit`}
        cloneAction={clonePurchaseInvoiceAction}
        prevHref={nav.prevId ? `/purchase-invoices/${nav.prevId}` : null}
        nextHref={nav.nextId ? `/purchase-invoices/${nav.nextId}` : null}
        index={nav.index}
        total={nav.total}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Purchase Invoice</h1>
            <p className="mt-1 text-lg text-slate-700">{invoice.party.name}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-slate-900">{ctx.orgName}</div>
            <div className="mt-2 text-slate-500">Number</div>
            <div className="text-slate-900">{invoice.number}</div>
            {invoice.supplierRef ? (
              <>
                <div className="mt-2 text-slate-500">Supplier ref</div>
                <div className="text-slate-900">{invoice.supplierRef}</div>
              </>
            ) : null}
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
                <td className="px-4 py-2">
                  {l.description}
                  <span className="ml-2 text-xs text-slate-400">
                    {l.account.name}
                  </span>
                </td>
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
      </div>

      {entry ? <TransactionJournal lines={entry.lines} currency={cur} /> : null}
    </div>
  );
}

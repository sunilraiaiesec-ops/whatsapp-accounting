import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getDebitNote } from "@/lib/documents";
import { cloneDebitNoteAction } from "@/app/actions/documents";
import { formatAmount } from "@/lib/money";
import { DocToolbar } from "@/components/DocToolbar";
import { TransactionJournal } from "@/components/TransactionJournal";

export default async function DebitNoteViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const data = await getDebitNote(ctx.orgId, id);
  if (!data) notFound();
  const { note, entry, nav } = data;

  const tax = note.lines.reduce((s, l) => s + l.taxAmount, 0n);
  const subtotal = note.lines.reduce((s, l) => s + l.lineTotal, 0n);

  return (
    <div className="mx-auto max-w-3xl">
      <DocToolbar
        listHref="/debit-notes"
        listLabel="Debit Notes"
        id={note.id}
        cloneAction={cloneDebitNoteAction}
        prevHref={nav.prevId ? `/debit-notes/${nav.prevId}` : null}
        nextHref={nav.nextId ? `/debit-notes/${nav.nextId}` : null}
        index={nav.index}
        total={nav.total}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Debit Note</h1>
            <p className="mt-1 text-lg text-slate-700">{note.party.name}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-slate-900">{ctx.orgName}</div>
            <div className="mt-2 text-slate-500">Number</div>
            <div className="text-slate-900">{note.number}</div>
            {note.supplierRef ? (
              <>
                <div className="mt-2 text-slate-500">Supplier ref</div>
                <div className="text-slate-900">{note.supplierRef}</div>
              </>
            ) : null}
            <div className="mt-2 text-slate-500">Date</div>
            <div className="text-slate-900">
              {note.date.toISOString().slice(0, 10)}
            </div>
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
            {note.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-200">
                <td className="px-4 py-2">
                  {l.description}
                  <span className="ml-2 text-xs text-slate-400">{l.account.name}</span>
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
            {tax > 0n ? (
              <>
                <tr className="text-slate-600">
                  <td className="px-4 py-1.5 text-right" colSpan={3}>
                    Subtotal
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">
                    {formatAmount(subtotal, cur)}
                  </td>
                </tr>
                <tr className="text-slate-600">
                  <td className="px-4 py-1.5 text-right" colSpan={3}>
                    Tax (recoverable)
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">
                    {formatAmount(tax, cur)}
                  </td>
                </tr>
              </>
            ) : null}
            <tr className="font-semibold">
              <td className="px-4 py-2 text-right" colSpan={3}>
                Total
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(note.total, cur)} {cur}
              </td>
            </tr>
          </tfoot>
        </table>

        {note.notes ? (
          <p className="mt-4 text-sm text-slate-500">{note.notes}</p>
        ) : null}
      </div>

      {entry ? <TransactionJournal lines={entry.lines} currency={cur} /> : null}
    </div>
  );
}

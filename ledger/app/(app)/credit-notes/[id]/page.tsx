import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getCreditNote } from "@/lib/documents";
import { cloneCreditNoteAction } from "@/app/actions/documents";
import { formatAmount } from "@/lib/money";
import { DocToolbar } from "@/components/DocToolbar";
import { TransactionJournal } from "@/components/TransactionJournal";

export default async function CreditNoteViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const data = await getCreditNote(ctx.orgId, id);
  if (!data) notFound();
  const { note, entry, nav } = data;

  const tax = note.lines.reduce((s, l) => s + l.taxAmount, 0n);
  const subtotal = note.lines.reduce((s, l) => s + l.lineTotal, 0n);

  return (
    <div className="mx-auto max-w-3xl">
      <DocToolbar
        listHref="/credit-notes"
        listLabel="Credit Notes"
        id={note.id}
        cloneAction={cloneCreditNoteAction}
        prevHref={nav.prevId ? `/credit-notes/${nav.prevId}` : null}
        nextHref={nav.nextId ? `/credit-notes/${nav.nextId}` : null}
        index={nav.index}
        total={nav.total}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Credit Note</h1>
            <p className="mt-1 text-lg text-slate-700">{note.party.name}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-slate-900">{ctx.orgName}</div>
            <div className="mt-2 text-slate-500">Number</div>
            <div className="text-slate-900">{note.number}</div>
            {note.reference ? (
              <>
                <div className="mt-2 text-slate-500">Reference</div>
                <div className="text-slate-900">{note.reference}</div>
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
                  {l.itemId && l.cost > 0n ? (
                    <span className="ml-2 text-xs text-emerald-600">
                      returned to stock · cost {formatAmount(l.cost, cur)}
                    </span>
                  ) : null}
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
                    Tax
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

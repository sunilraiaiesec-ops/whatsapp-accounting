import { notFound } from "next/navigation";
import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { getRefundReceipt } from "@/lib/documents";
import { formatAmount } from "@/lib/money";
import { TransactionJournal } from "@/components/TransactionJournal";

export default async function RefundReceiptViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const data = await getRefundReceipt(ctx.orgId, id);
  if (!data) notFound();
  const { refund, entry, nav } = data;

  const tax = refund.lines.reduce((s, l) => s + l.taxAmount, 0n);
  const subtotal = refund.lines.reduce((s, l) => s + l.lineTotal, 0n);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between text-sm print:hidden">
        <Link
          href="/refund-receipts"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Refund receipts
        </Link>
        <span className="tabular-nums text-slate-500">
          {nav.index} / {nav.total}
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Refund Receipt</h1>
            <p className="mt-1 text-lg text-slate-700">{refund.party?.name ?? "Walk-in"}</p>
            <p className="text-sm text-slate-500">Paid from {refund.bankAccount.name}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-slate-900">{ctx.orgName}</div>
            <div className="mt-2 text-slate-500">Number</div>
            <div className="text-slate-900">{refund.number}</div>
            <div className="mt-2 text-slate-500">Date</div>
            <div className="text-slate-900">{refund.date.toISOString().slice(0, 10)}</div>
          </div>
        </div>

        <table className="mt-6 w-full border border-slate-300 text-sm">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="w-20 px-4 py-2 text-right font-semibold">Qty</th>
              <th className="w-32 px-4 py-2 text-right font-semibold">Unit price</th>
              <th className="w-32 px-4 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {refund.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-200">
                <td className="px-4 py-2">
                  {l.description}
                  {l.itemId && l.cost > 0n ? (
                    <span className="ml-2 text-xs text-emerald-600">
                      returned to stock · cost {formatAmount(l.cost, cur)}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{l.quantity.toString()}</td>
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
                Total refunded
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(refund.total, cur)} {cur}
              </td>
            </tr>
          </tfoot>
        </table>

        {refund.notes ? (
          <p className="mt-4 text-sm text-slate-500">{refund.notes}</p>
        ) : null}
      </div>

      {entry ? <TransactionJournal lines={entry.lines} currency={cur} /> : null}
    </div>
  );
}

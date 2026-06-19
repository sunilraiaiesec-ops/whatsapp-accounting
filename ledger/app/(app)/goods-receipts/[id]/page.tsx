import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getGoodsReceipt } from "@/lib/inventory";
import { formatAmount } from "@/lib/money";
import { TransactionJournal } from "@/components/TransactionJournal";
import Link from "next/link";

export default async function GoodsReceiptViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const data = await getGoodsReceipt(ctx.orgId, id);
  if (!data) notFound();
  const { receipt, entry, nav } = data;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between text-sm print:hidden">
        <Link
          href="/goods-receipts"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Goods Receipts
        </Link>
        <span className="tabular-nums text-slate-500">
          {nav.index} / {nav.total}
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Goods Receipt</h1>
            <p className="mt-1 text-lg text-slate-700">{receipt.party.name}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-slate-900">{ctx.orgName}</div>
            <div className="mt-2 text-slate-500">Number</div>
            <div className="text-slate-900">{receipt.number}</div>
            <div className="mt-2 text-slate-500">Date</div>
            <div className="text-slate-900">
              {receipt.date.toISOString().slice(0, 10)}
            </div>
          </div>
        </div>

        <table className="mt-6 w-full border border-slate-300 text-sm">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-4 py-2 font-semibold">Item</th>
              <th className="w-24 px-4 py-2 text-right font-semibold">Qty</th>
              <th className="w-32 px-4 py-2 text-right font-semibold">Unit cost</th>
              <th className="w-36 px-4 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-200">
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-slate-400">{l.item.code}</span>{" "}
                  {l.item.name}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {l.quantity.toString()}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(l.unitCost, cur)}
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
                {formatAmount(receipt.total, cur)} {cur}
              </td>
            </tr>
          </tfoot>
        </table>

        {receipt.notes ? (
          <p className="mt-4 text-sm text-slate-500">{receipt.notes}</p>
        ) : null}
      </div>

      {entry ? <TransactionJournal lines={entry.lines} currency={cur} /> : null}
    </div>
  );
}

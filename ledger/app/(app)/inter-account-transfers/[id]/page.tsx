import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getInterAccountTransfer } from "@/lib/documents";
import { cloneInterAccountTransferAction } from "@/app/actions/documents";
import { formatAmount } from "@/lib/money";
import { DocToolbar } from "@/components/DocToolbar";
import { TransactionJournal } from "@/components/TransactionJournal";

export default async function TransferViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const data = await getInterAccountTransfer(ctx.orgId, id);
  if (!data) notFound();
  const { transfer, entry, nav } = data;

  return (
    <div className="mx-auto max-w-3xl">
      <DocToolbar
        listHref="/inter-account-transfers"
        listLabel="Transfers"
        id={transfer.id}
        editHref={`/inter-account-transfers/${transfer.id}/edit`}
        cloneAction={cloneInterAccountTransferAction}
        prevHref={nav.prevId ? `/inter-account-transfers/${nav.prevId}` : null}
        nextHref={nav.nextId ? `/inter-account-transfers/${nav.nextId}` : null}
        index={nav.index}
        total={nav.total}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Inter Account Transfer</h1>
            <p className="mt-1 text-lg text-slate-700">
              {transfer.fromAccount.name} → {transfer.toAccount.name}
            </p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-slate-900">{ctx.orgName}</div>
            <div className="mt-2 text-slate-500">Number</div>
            <div className="text-slate-900">{transfer.number}</div>
            <div className="mt-2 text-slate-500">Date</div>
            <div className="text-slate-900">
              {transfer.date.toISOString().slice(0, 10)}
            </div>
            {transfer.reference ? (
              <>
                <div className="mt-2 text-slate-500">Reference</div>
                <div className="text-slate-900">{transfer.reference}</div>
              </>
            ) : null}
          </div>
        </div>

        {transfer.description ? (
          <p className="mt-4 text-sm text-slate-600">{transfer.description}</p>
        ) : null}

        <table className="mt-6 w-full border border-slate-300 text-sm">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="px-4 py-2 text-slate-500">From (money out)</td>
              <td className="px-4 py-2 text-right">{transfer.fromAccount.name}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="px-4 py-2 text-slate-500">To (money in)</td>
              <td className="px-4 py-2 text-right">{transfer.toAccount.name}</td>
            </tr>
            <tr className="font-semibold">
              <td className="px-4 py-2">Amount</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(transfer.amount, cur)} {cur}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {entry ? <TransactionJournal lines={entry.lines} currency={cur} /> : null}
    </div>
  );
}

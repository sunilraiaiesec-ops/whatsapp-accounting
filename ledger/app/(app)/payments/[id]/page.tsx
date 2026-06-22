import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getPayment } from "@/lib/documents";
import { clonePaymentAction } from "@/app/actions/documents";
import { formatAmount } from "@/lib/money";
import { DocToolbar } from "@/components/DocToolbar";
import { TransactionJournal } from "@/components/TransactionJournal";

export default async function PaymentViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const data = await getPayment(ctx.orgId, id);
  if (!data) notFound();
  const { payment, entry, nav } = data;

  return (
    <div className="mx-auto max-w-3xl">
      <DocToolbar
        listHref="/payments"
        listLabel="Payments"
        id={payment.id}
        editHref={`/payments/${payment.id}/edit`}
        cloneAction={clonePaymentAction}
        prevHref={nav.prevId ? `/payments/${nav.prevId}` : null}
        nextHref={nav.nextId ? `/payments/${nav.nextId}` : null}
        index={nav.index}
        total={nav.total}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Payment</h1>
            <p className="mt-1 text-lg text-slate-700">
              {payment.party?.name ?? "—"}
            </p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-slate-900">{ctx.orgName}</div>
            <div className="mt-2 text-slate-500">Date</div>
            <div className="text-slate-900">
              {payment.date.toISOString().slice(0, 10)}
            </div>
            <div className="mt-2 text-slate-500">Reference</div>
            <div className="text-slate-900">{payment.number}</div>
          </div>
        </div>

        {payment.description ? (
          <p className="mt-4 text-sm font-medium uppercase tracking-wide text-slate-500">
            {payment.description}
          </p>
        ) : null}

        {payment.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {payment.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <p className="mt-4 text-sm text-slate-500">
          Paid from:{" "}
          <span className="text-slate-900">{payment.bankAccount.name}</span>
        </p>

        <table className="mt-4 w-full border border-slate-300 text-sm">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-4 py-2 font-semibold">Account</th>
              <th className="w-48 px-4 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {payment.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-200">
                <td className="px-4 py-2">
                  {l.account.name}
                  {payment.party && l.account.isControl
                    ? ` — ${payment.party.name}`
                    : ""}
                  {l.memo ? (
                    <span className="ml-2 text-xs text-slate-400">{l.memo}</span>
                  ) : null}
                  {l.className ? (
                    <span className="ml-2 inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                      {l.className}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(l.amount, cur)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-4 py-2 text-right">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(payment.total, cur)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {entry ? <TransactionJournal lines={entry.lines} currency={cur} /> : null}
    </div>
  );
}

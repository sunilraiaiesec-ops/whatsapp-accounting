import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { listCreditNotes } from "@/lib/documents";
import { formatAmount } from "@/lib/money";

export default async function CreditNotesPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const notes = await listCreditNotes(ctx.orgId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Credit Notes</h1>
          <p className="text-sm text-slate-500">
            Customer returns and refunds — reduce Accounts receivable.
          </p>
        </div>
        <Link
          href="/credit-notes/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New credit note
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {notes.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No credit notes yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <tr
                  key={n.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link
                      href={`/credit-notes/${n.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {n.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{n.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-slate-700">{n.party.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(n.total, cur)} {cur}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

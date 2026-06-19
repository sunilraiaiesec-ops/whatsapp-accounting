import { formatAmount } from "@/lib/money";

type JournalLine = {
  id: string;
  debit: bigint;
  credit: bigint;
  memo: string | null;
  account: { code: string; name: string };
  party: { name: string } | null;
};

// The double-entry behind a document — mirrors manager.io's "Transaction Journal".
export function TransactionJournal({
  lines,
  currency,
}: {
  lines: JournalLine[];
  currency: string;
}) {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0n);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0n);

  return (
    <section className="mt-6 print:hidden">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Transaction Journal
      </h2>
      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Account</th>
              <th className="w-40 px-4 py-2 text-right font-medium">Debit</th>
              <th className="w-40 px-4 py-2 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-slate-400">
                    {l.account.code}
                  </span>{" "}
                  {l.account.name}
                  {l.party ? (
                    <span className="text-slate-500"> — {l.party.name}</span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {l.debit > 0n ? formatAmount(l.debit, currency) : ""}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {l.credit > 0n ? formatAmount(l.credit, currency) : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(totalDebit, currency)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(totalCredit, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

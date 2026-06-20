import { ReportBackLink } from "@/components/ReportBackLink";
import { requireContext } from "@/lib/auth/current";
import { formatAmount } from "@/lib/money";
import { generalLedger } from "@/lib/reports";

export default async function GeneralLedgerReportPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const accounts = await generalLedger(ctx.orgId);

  return (
    <div className="mx-auto max-w-5xl">
      <ReportBackLink />
      <h1 className="mt-2 text-2xl font-semibold">General Ledger</h1>
      <p className="text-sm text-[var(--muted)]">
        Every posting by account, in date order.
      </p>

      {accounts.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No ledger activity yet.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {accounts.map((account) => (
            <section key={account.id} className="card-surface overflow-hidden">
              <div className="border-b border-[var(--border)] bg-slate-50 px-4 py-2">
                <span className="font-mono text-xs text-slate-400">{account.code}</span>{" "}
                <span className="font-semibold text-slate-800">{account.name}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Debit</th>
                      <th className="px-3 py-2 text-right font-medium">Credit</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.lines.map((line) => (
                      <tr key={line.id} className="border-b border-slate-50">
                        <td className="px-3 py-1.5 tabular-nums text-slate-600">
                          {line.date.toISOString().slice(0, 10)}
                        </td>
                        <td className="px-3 py-1.5 text-slate-800">
                          {line.description?.trim() ||
                            line.partyName ||
                            line.reference ||
                            "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {line.debit === 0n ? "—" : formatAmount(line.debit, cur)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {line.credit === 0n ? "—" : formatAmount(line.credit, cur)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {formatAmount(line.balance, cur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-2" colSpan={2}>
                        Account total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatAmount(account.totalDebit, cur)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatAmount(account.totalCredit, cur)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatAmount(account.closingBalance, cur)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

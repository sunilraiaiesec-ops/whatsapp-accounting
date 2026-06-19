import { requireContext } from "@/lib/auth/current";
import { trialBalance } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

export default async function TrialBalancePage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const tb = await trialBalance(ctx.orgId);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Trial Balance</h1>
      <p className="text-sm text-slate-500">
        As of {new Date().toISOString().slice(0, 10)} · all amounts in {cur}.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Account</th>
              <th className="w-40 px-4 py-2 text-right font-medium">Debit</th>
              <th className="w-40 px-4 py-2 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            {tb.accounts.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-slate-400">{a.code}</span>{" "}
                  {a.name}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {a.debit > 0n ? formatAmount(a.debit, cur) : ""}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {a.credit > 0n ? formatAmount(a.credit, cur) : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(tb.totalDebit, cur)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(tb.totalCredit, cur)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p
        className={`mt-3 text-sm ${
          tb.balanced ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {tb.balanced ? "Debits equal credits ✓" : "Ledger is out of balance ✗"}
      </p>
    </div>
  );
}

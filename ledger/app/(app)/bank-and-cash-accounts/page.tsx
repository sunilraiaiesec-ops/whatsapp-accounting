import { requireContext } from "@/lib/auth/current";
import { bankAndCashWithBalances } from "@/lib/accounts";
import { formatAmount } from "@/lib/money";
import { BankAccountForm } from "@/components/BankAccountForm";

export default async function BankAndCashAccountsPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const accounts = await bankAndCashWithBalances(ctx.orgId);
  const total = accounts.reduce((s, a) => s + a.balance, 0n);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Bank and Cash Accounts</h1>
      <p className="text-sm text-slate-500">
        Money in your bank and cash accounts, with live balances from the ledger.
      </p>

      <div className="mt-6">
        <BankAccountForm />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Account</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-slate-400">{a.code}</span>{" "}
                  {a.name}
                </td>
                <td className="px-4 py-2 capitalize text-slate-600">{a.subtype}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(a.balance, cur)} {cur}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <td className="px-4 py-2" colSpan={2}>
                Total
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(total, cur)} {cur}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { bankAndCashAccounts } from "@/lib/accounts";
import { TransferForm } from "@/components/TransferForm";

export default async function NewTransferPage() {
  const ctx = await requireContext();
  const accounts = await bankAndCashAccounts(ctx.orgId);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/inter-account-transfers"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to transfers
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New Inter Account Transfer</h1>
      <p className="text-sm text-slate-500">
        Posts Dr destination account / Cr source account — a balanced move with no
        effect on profit.
      </p>

      {accounts.length < 2 ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You need at least two bank/cash accounts to make a transfer. Add another
          in{" "}
          <Link href="/bank-and-cash-accounts" className="underline">
            Bank and Cash Accounts
          </Link>
          .
        </p>
      ) : (
        <TransferForm
          currency={ctx.baseCurrency}
          accounts={accounts.map((a) => ({
            id: a.id,
            label: `${a.code} — ${a.name}`,
          }))}
        />
      )}
    </div>
  );
}

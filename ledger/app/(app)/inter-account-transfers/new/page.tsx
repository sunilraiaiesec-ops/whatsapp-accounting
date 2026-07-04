import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { bankAndCashAccounts, creditCardAccounts } from "@/lib/accounts";
import { TransferForm } from "@/components/TransferForm";

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const isCreditCard = mode === "credit-card";
  const ctx = await requireContext();

  const bankCash = await bankAndCashAccounts(ctx.orgId);
  const cards = isCreditCard ? await creditCardAccounts(ctx.orgId) : [];

  const toOptions = (list: { id: string; code: string; name: string }[]) =>
    list.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }));

  if (isCreditCard) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href="/inter-account-transfers"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to transfers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Pay down credit card</h1>
        <p className="text-sm text-slate-500">
          Moves money from a bank or cash account to reduce a credit-card balance —
          Dr credit card / Cr bank.
        </p>

        {bankCash.length === 0 || cards.length === 0 ? (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {cards.length === 0 ? (
              <>
                You have no credit-card accounts yet. Add one (choose{" "}
                <span className="font-medium">Credit card</span>) in{" "}
                <Link href="/bank-and-cash-accounts" className="underline">
                  Bank &amp; Cash Accounts
                </Link>
                .
              </>
            ) : (
              <>
                You need a bank or cash account to pay from. Add one in{" "}
                <Link href="/bank-and-cash-accounts" className="underline">
                  Bank &amp; Cash Accounts
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <TransferForm
            currency={ctx.baseCurrency}
            accounts={[]}
            fromAccounts={toOptions(bankCash)}
            toAccounts={toOptions(cards)}
            fromLabel="Pay from (bank / cash)"
            toLabel="Credit card"
            submitLabel="Save payment"
          />
        )}
      </div>
    );
  }

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

      {bankCash.length < 2 ? (
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
          accounts={toOptions(bankCash)}
        />
      )}
    </div>
  );
}

import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { listAccounts, bankAndCashAccounts } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { createPaymentAction } from "@/app/actions/documents";
import { CashDocForm } from "@/components/CashDocForm";

export default async function NewPaymentPage() {
  const ctx = await requireContext();
  const [banks, accounts, parties] = await Promise.all([
    bankAndCashAccounts(ctx.orgId),
    listAccounts(ctx.orgId),
    listParties(ctx.orgId),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/payments" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to payments
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New Payment</h1>
      <p className="text-sm text-slate-500">Record money paid out.</p>

      <CashDocForm
        mode="payment"
        action={createPaymentAction}
        currency={ctx.baseCurrency}
        bankAccounts={banks.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        parties={parties.map((p) => ({ id: p.id, label: p.name }))}
        accounts={accounts.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
        }))}
      />
    </div>
  );
}

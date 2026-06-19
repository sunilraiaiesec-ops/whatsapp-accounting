import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { accountsByType } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { CreditNoteForm } from "@/components/CreditNoteForm";

export default async function NewCreditNotePage() {
  const ctx = await requireContext();
  const [customers, income] = await Promise.all([
    listParties(ctx.orgId, "customer"),
    accountsByType(ctx.orgId, "INCOME"),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/credit-notes"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to credit notes
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New Credit Note</h1>
      <p className="text-sm text-slate-500">
        A sales return/refund: reverses income and reduces Accounts receivable.
      </p>

      <CreditNoteForm
        currency={ctx.baseCurrency}
        customers={customers.map((c) => ({ id: c.id, label: c.name }))}
        incomeAccounts={income.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
        }))}
      />
    </div>
  );
}

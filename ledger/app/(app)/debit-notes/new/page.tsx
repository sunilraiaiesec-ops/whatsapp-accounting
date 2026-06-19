import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { accountsByType } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { DebitNoteForm } from "@/components/DebitNoteForm";

export default async function NewDebitNotePage() {
  const ctx = await requireContext();
  const [suppliers, expense, asset] = await Promise.all([
    listParties(ctx.orgId, "supplier"),
    accountsByType(ctx.orgId, "EXPENSE"),
    accountsByType(ctx.orgId, "ASSET"),
  ]);

  const assetLines = asset.filter(
    (a) => !a.isControl && a.subtype !== "bank" && a.subtype !== "cash",
  );
  const accounts = [...expense, ...assetLines];

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/debit-notes" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to debit notes
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New Debit Note</h1>
      <p className="text-sm text-slate-500">
        A purchase return: reverses the expense/asset and reduces Accounts payable.
      </p>

      <DebitNoteForm
        currency={ctx.baseCurrency}
        suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        expenseAccounts={accounts.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
        }))}
      />
    </div>
  );
}

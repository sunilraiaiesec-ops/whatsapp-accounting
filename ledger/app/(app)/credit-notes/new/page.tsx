import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { accountsByType } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { listInventoryItems } from "@/lib/inventory";
import { formatAmount } from "@/lib/money";
import { CreditNoteForm } from "@/components/CreditNoteForm";

export default async function NewCreditNotePage() {
  const ctx = await requireContext();
  const [customers, income, items] = await Promise.all([
    listParties(ctx.orgId, "customer"),
    accountsByType(ctx.orgId, "INCOME"),
    listInventoryItems(ctx.orgId),
  ]);

  const salesAccount = income.find((a) => a.subtype === "sales") ?? income[0];

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
        salesAccountId={salesAccount?.id ?? ""}
        items={items.map((it) => ({
          id: it.id,
          label: `${it.code} — ${it.name}`,
          name: it.name,
          salePrice: formatAmount(it.salePrice, ctx.baseCurrency),
        }))}
      />
    </div>
  );
}

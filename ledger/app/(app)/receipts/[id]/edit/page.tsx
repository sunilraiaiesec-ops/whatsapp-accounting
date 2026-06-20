import Link from "next/link";
import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getReceipt } from "@/lib/documents";
import { updateReceiptAction } from "@/app/actions/document-update";
import { listParties } from "@/lib/parties";
import { formatAmount } from "@/lib/money";
import { CashDocForm } from "@/components/CashDocForm";
import {
  bankAndCashWithBalances,
  receiptCounterpartAccounts,
} from "@/lib/accounts";

export default async function EditReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const data = await getReceipt(ctx.orgId, id);
  if (!data) notFound();
  const { receipt } = data;

  const [banks, accounts, parties] = await Promise.all([
    bankAndCashWithBalances(ctx.orgId),
    receiptCounterpartAccounts(ctx.orgId),
    listParties(ctx.orgId),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/receipts/${id}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to receipt
      </Link>

      <CashDocForm
        mode="receipt"
        action={updateReceiptAction}
        documentId={receipt.id}
        currency={ctx.baseCurrency}
        formTitle={`Edit ${receipt.number}`}
        cancelHref={`/receipts/${id}`}
        bankAccounts={banks.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
          balanceLabel: `${formatAmount(a.balance, ctx.baseCurrency)} ${ctx.baseCurrency}`,
        }))}
        parties={parties.map((p) => ({ id: p.id, label: p.name }))}
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        defaults={{
          date: receipt.date.toISOString().slice(0, 10),
          bankAccountId: receipt.bankAccountId,
          partyId: receipt.partyId ?? "",
          reference: receipt.reference ?? "",
          description: receipt.description ?? "",
          paymentMethod: receipt.paymentMethod ?? "",
          lines: receipt.lines.map((l) => ({
            accountId: l.accountId,
            amount: formatAmount(l.amount, ctx.baseCurrency),
            memo: l.memo ?? "",
          })),
        }}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getReceipt } from "@/lib/documents";
import { updateReceiptAction } from "@/app/actions/document-update";
import { listParties } from "@/lib/parties";
import { formatAmount } from "@/lib/money";
import { CashDocForm } from "@/components/CashDocForm";
import {
  bankAndCashAccounts,
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
    bankAndCashAccounts(ctx.orgId),
    receiptCounterpartAccounts(ctx.orgId),
    listParties(ctx.orgId),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/receipts/${id}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to receipt
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Edit Receipt {receipt.number}</h1>

      <CashDocForm
        mode="receipt"
        action={updateReceiptAction}
        documentId={receipt.id}
        currency={ctx.baseCurrency}
        bankAccounts={banks.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        parties={parties.map((p) => ({ id: p.id, label: p.name }))}
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        defaults={{
          date: receipt.date.toISOString().slice(0, 10),
          bankAccountId: receipt.bankAccountId,
          partyId: receipt.partyId ?? "",
          reference: receipt.reference ?? "",
          description: receipt.description ?? "",
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

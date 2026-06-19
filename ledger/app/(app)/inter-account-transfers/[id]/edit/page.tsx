import Link from "next/link";
import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getInterAccountTransfer } from "@/lib/documents";
import { bankAndCashAccounts } from "@/lib/accounts";
import { formatAmount } from "@/lib/money";
import { TransferForm } from "@/components/TransferForm";

export default async function EditTransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const data = await getInterAccountTransfer(ctx.orgId, id);
  if (!data) notFound();
  const { transfer } = data;

  const accounts = await bankAndCashAccounts(ctx.orgId);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/inter-account-transfers/${id}`}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to transfer
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Edit Transfer {transfer.number}</h1>

      <TransferForm
        documentId={transfer.id}
        currency={ctx.baseCurrency}
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        defaults={{
          date: transfer.date.toISOString().slice(0, 10),
          fromAccountId: transfer.fromAccountId,
          toAccountId: transfer.toAccountId,
          amount: formatAmount(transfer.amount, ctx.baseCurrency),
          reference: transfer.reference ?? "",
          description: transfer.description ?? "",
        }}
      />
    </div>
  );
}

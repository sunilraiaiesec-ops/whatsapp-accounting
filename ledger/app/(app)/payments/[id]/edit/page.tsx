import Link from "next/link";
import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getPayment } from "@/lib/documents";
import { updatePaymentAction } from "@/app/actions/document-update";
import { listAccounts, bankAndCashAccounts } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { formatAmount } from "@/lib/money";
import { CashDocForm } from "@/components/CashDocForm";

export default async function EditPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const data = await getPayment(ctx.orgId, id);
  if (!data) notFound();
  const { payment } = data;

  const [banks, accounts, parties] = await Promise.all([
    bankAndCashAccounts(ctx.orgId),
    listAccounts(ctx.orgId),
    listParties(ctx.orgId),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/payments/${id}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to payment
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Edit Payment {payment.number}</h1>

      <CashDocForm
        mode="payment"
        action={updatePaymentAction}
        documentId={payment.id}
        currency={ctx.baseCurrency}
        bankAccounts={banks.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        parties={parties.map((p) => ({ id: p.id, label: p.name }))}
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        defaults={{
          date: payment.date.toISOString().slice(0, 10),
          bankAccountId: payment.bankAccountId,
          partyId: payment.partyId ?? "",
          reference: payment.reference ?? "",
          description: payment.description ?? "",
          lines: payment.lines.map((l) => ({
            accountId: l.accountId,
            amount: formatAmount(l.amount, ctx.baseCurrency),
          })),
        }}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getPayment } from "@/lib/documents";
import { updatePaymentAction } from "@/app/actions/document-update";
import {
  bankAndCashWithBalances,
  paymentCounterpartAccounts,
} from "@/lib/accounts";
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
    bankAndCashWithBalances(ctx.orgId),
    paymentCounterpartAccounts(ctx.orgId),
    listParties(ctx.orgId),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/payments/${id}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to payment
      </Link>

      <CashDocForm
        mode="payment"
        action={updatePaymentAction}
        documentId={payment.id}
        currency={ctx.baseCurrency}
        formTitle={`Edit ${payment.number}`}
        cancelHref={`/payments/${id}`}
        bankAccounts={banks.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
          balanceLabel: `${formatAmount(a.balance, ctx.baseCurrency)} ${ctx.baseCurrency}`,
        }))}
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
            memo: l.memo ?? "",
          })),
        }}
      />
    </div>
  );
}

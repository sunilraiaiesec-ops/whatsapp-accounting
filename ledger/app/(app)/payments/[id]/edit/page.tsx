import Link from "next/link";
import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getPayment, listClassNames } from "@/lib/documents";
import { updatePaymentAction } from "@/app/actions/document-update";
import {
  bankAndCashWithBalances,
  paymentCounterpartAccounts,
} from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { listInventoryItems } from "@/lib/inventory";
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

  const [banks, accounts, parties, classOptions, items] = await Promise.all([
    bankAndCashWithBalances(ctx.orgId),
    paymentCounterpartAccounts(ctx.orgId),
    listParties(ctx.orgId),
    listClassNames(ctx.orgId),
    listInventoryItems(ctx.orgId),
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
        classOptions={classOptions}
        items={items.map((it) => ({
          id: it.id,
          label: `${it.code} — ${it.name}`,
          unitCost: formatAmount(it.avgCost, ctx.baseCurrency),
        }))}
        defaults={{
          date: payment.date.toISOString().slice(0, 10),
          bankAccountId: payment.bankAccountId,
          partyId: payment.partyId ?? "",
          reference: payment.reference ?? "",
          description: payment.description ?? "",
          paymentMethod: payment.paymentMethod ?? "",
          tags: payment.tags,
          currency: payment.currency,
          exchangeRate: payment.exchangeRate ? payment.exchangeRate.toString() : null,
          lines: payment.lines
            .filter((l) => !l.itemId)
            .map((l) => ({
              accountId: l.accountId,
              amount: formatAmount(l.amount, ctx.baseCurrency),
              memo: l.memo ?? "",
              className: l.className ?? "",
              taxRate: l.taxRate ? l.taxRate.toString() : "",
            })),
          itemLines: payment.lines
            .filter((l) => l.itemId)
            .map((l) => ({
              itemId: l.itemId as string,
              quantity: (l.quantity ?? "1").toString(),
              unitCost: formatAmount(l.unitCost ?? 0n, ctx.baseCurrency),
              memo: l.memo ?? "",
              className: l.className ?? "",
              taxRate: l.taxRate ? l.taxRate.toString() : "",
            })),
          allocations: payment.allocations.map((a) => ({
            invoiceId: a.purchaseInvoiceId,
            invoiceNumber: a.invoice.number,
            amount: formatAmount(a.amountApplied, ctx.baseCurrency),
          })),
        }}
      />
    </div>
  );
}

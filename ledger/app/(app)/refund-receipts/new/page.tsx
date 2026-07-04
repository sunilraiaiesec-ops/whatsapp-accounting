import { requireContext } from "@/lib/auth/current";
import { accountsByType, bankAndCashAccounts } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { CashSaleForm } from "@/components/CashSaleForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function NewRefundReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ partyId?: string }>;
}) {
  const { partyId } = await searchParams;
  const ctx = await requireContext();

  const [customers, income, banks] = await Promise.all([
    listParties(ctx.orgId, "customer"),
    accountsByType(ctx.orgId, "INCOME"),
    bankAndCashAccounts(ctx.orgId),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New Refund Receipt"
        subtitle="Refund a customer — money paid out of a bank or cash account."
        backHref="/refund-receipts"
        backLabel="Refund receipts"
      />

      <CashSaleForm
        mode="refund_receipt"
        currency={ctx.baseCurrency}
        defaults={partyId ? { partyId } : undefined}
        parties={customers.map((c) => ({ id: c.id, label: c.name }))}
        incomeAccounts={income.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        bankAccounts={banks.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
      />
    </div>
  );
}

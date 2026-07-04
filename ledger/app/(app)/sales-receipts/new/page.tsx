import { requireContext } from "@/lib/auth/current";
import { accountsByType, bankAndCashAccounts } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { listInventoryItems } from "@/lib/inventory";
import { formatAmount } from "@/lib/money";
import { CashSaleForm } from "@/components/CashSaleForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function NewSalesReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ partyId?: string }>;
}) {
  const { partyId } = await searchParams;
  const ctx = await requireContext();

  const [customers, income, banks, items] = await Promise.all([
    listParties(ctx.orgId, "customer"),
    accountsByType(ctx.orgId, "INCOME"),
    bankAndCashAccounts(ctx.orgId),
    listInventoryItems(ctx.orgId),
  ]);

  const salesAccount = income.find((a) => a.subtype === "sales") ?? income[0];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New Sales Receipt"
        subtitle="A cash sale — the customer pays at the point of sale."
        backHref="/sales-receipts"
        backLabel="Sales receipts"
      />

      <CashSaleForm
        mode="sales_receipt"
        currency={ctx.baseCurrency}
        defaults={partyId ? { partyId } : undefined}
        parties={customers.map((c) => ({ id: c.id, label: c.name }))}
        incomeAccounts={income.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        bankAccounts={banks.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
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

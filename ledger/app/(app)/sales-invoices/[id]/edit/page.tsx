import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getSalesInvoice } from "@/lib/documents";
import { accountsByType } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { listInventoryItems } from "@/lib/inventory";
import { formatAmount } from "@/lib/money";
import { SalesInvoiceForm } from "@/components/SalesInvoiceForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function EditSalesInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const data = await getSalesInvoice(ctx.orgId, id);
  if (!data) notFound();
  const { invoice } = data;

  const [customers, income, items] = await Promise.all([
    listParties(ctx.orgId, "customer"),
    accountsByType(ctx.orgId, "INCOME"),
    listInventoryItems(ctx.orgId),
  ]);
  const salesAccount = income.find((a) => a.subtype === "sales") ?? income[0];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Edit ${invoice.number}`}
        subtitle={`Update invoice for ${invoice.party.name}.`}
        backHref={`/sales-invoices/${id}`}
        backLabel="View invoice"
      />

      <SalesInvoiceForm
        documentId={invoice.id}
        currency={ctx.baseCurrency}
        customers={customers.map((c) => ({ id: c.id, label: c.name }))}
        incomeAccounts={income.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        salesAccountId={salesAccount?.id ?? ""}
        items={items.map((it) => ({
          id: it.id,
          label: `${it.code} — ${it.name}`,
          name: it.name,
          salePrice: formatAmount(it.salePrice, ctx.baseCurrency),
        }))}
        defaults={{
          partyId: invoice.partyId,
          reference: invoice.reference ?? "",
          date: invoice.date.toISOString().slice(0, 10),
          dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? "",
          notes: invoice.notes ?? "",
          lines: invoice.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity.toString(),
            unitPrice: formatAmount(l.unitPrice, ctx.baseCurrency),
            accountId: l.accountId,
            itemId: l.itemId ?? "",
            taxRate: l.taxRate != null ? l.taxRate.toString() : "",
          })),
        }}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { getPurchaseInvoice } from "@/lib/documents";
import { accountsByType } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { formatAmount } from "@/lib/money";
import { PurchaseInvoiceForm } from "@/components/PurchaseInvoiceForm";

export default async function EditPurchaseInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const data = await getPurchaseInvoice(ctx.orgId, id);
  if (!data) notFound();
  const { invoice } = data;

  const [suppliers, expense, asset] = await Promise.all([
    listParties(ctx.orgId, "supplier"),
    accountsByType(ctx.orgId, "EXPENSE"),
    accountsByType(ctx.orgId, "ASSET"),
  ]);
  const assetLines = asset.filter(
    (a) => !a.isControl && a.subtype !== "bank" && a.subtype !== "cash",
  );
  const accounts = [...expense, ...assetLines];

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/purchase-invoices/${id}`}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to bill
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Edit Purchase Invoice {invoice.number}</h1>

      <PurchaseInvoiceForm
        documentId={invoice.id}
        currency={ctx.baseCurrency}
        suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        expenseAccounts={accounts.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
        }))}
        defaults={{
          partyId: invoice.partyId,
          supplierRef: invoice.supplierRef ?? "",
          date: invoice.date.toISOString().slice(0, 10),
          dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? "",
          notes: invoice.notes ?? "",
          lines: invoice.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity.toString(),
            unitPrice: formatAmount(l.unitPrice, ctx.baseCurrency),
            accountId: l.accountId,
            taxRate: l.taxRate != null ? l.taxRate.toString() : "",
          })),
        }}
      />
    </div>
  );
}

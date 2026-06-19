import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { accountsByType } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { PurchaseInvoiceForm } from "@/components/PurchaseInvoiceForm";

export default async function NewPurchaseInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ partyId?: string }>;
}) {
  const { partyId } = await searchParams;
  const ctx = await requireContext();
  const today = new Date().toISOString().slice(0, 10);
  const [suppliers, expense, asset] = await Promise.all([
    listParties(ctx.orgId, "supplier"),
    accountsByType(ctx.orgId, "EXPENSE"),
    accountsByType(ctx.orgId, "ASSET"),
  ]);

  // Bills typically hit expense accounts, but may also capitalize to assets
  // (e.g. inventory). Exclude control and bank/cash accounts.
  const assetLines = asset.filter(
    (a) => !a.isControl && a.subtype !== "bank" && a.subtype !== "cash",
  );
  const accounts = [...expense, ...assetLines];

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/purchase-invoices"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to purchase invoices
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New Purchase Invoice</h1>
      <p className="text-sm text-slate-500">
        A bill from a supplier on credit: posts to your expense/asset accounts and
        Accounts payable.
      </p>

      <PurchaseInvoiceForm
        currency={ctx.baseCurrency}
        defaults={
          partyId
            ? {
                partyId,
                supplierRef: "",
                date: today,
                dueDate: "",
                notes: "",
                lines: [],
              }
            : undefined
        }
        suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        expenseAccounts={accounts.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
        }))}
      />
    </div>
  );
}

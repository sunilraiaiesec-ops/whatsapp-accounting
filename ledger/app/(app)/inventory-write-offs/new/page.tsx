import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { accountsByType } from "@/lib/accounts";
import { listInventoryItems } from "@/lib/inventory";
import { WriteOffForm } from "@/components/WriteOffForm";

export default async function NewWriteOffPage() {
  const ctx = await requireContext();
  const [items, expense] = await Promise.all([
    listInventoryItems(ctx.orgId),
    accountsByType(ctx.orgId, "EXPENSE"),
  ]);

  const inStock = items.filter((it) => it.qtyOnHand.gt(0));

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/inventory-write-offs"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to write-offs
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New Inventory Write-off</h1>
      <p className="text-sm text-slate-500">
        Removes stock at its average cost and books the loss to an expense account.
      </p>

      {inStock.length === 0 ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No items with stock on hand. Receive stock in{" "}
          <Link href="/goods-receipts" className="underline">
            Goods Receipts
          </Link>{" "}
          first.
        </p>
      ) : (
        <WriteOffForm
          items={inStock.map((it) => ({
            id: it.id,
            label: `${it.code} — ${it.name}`,
            onHand: it.qtyOnHand.toString(),
          }))}
          expenseAccounts={expense.map((a) => ({
            id: a.id,
            label: `${a.code} — ${a.name}`,
          }))}
        />
      )}
    </div>
  );
}

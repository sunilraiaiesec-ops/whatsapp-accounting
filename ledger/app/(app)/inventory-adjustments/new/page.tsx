import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { accountsByType } from "@/lib/accounts";
import { listInventoryItems } from "@/lib/inventory";
import { InventoryAdjustmentForm } from "@/components/InventoryAdjustmentForm";

export default async function NewInventoryAdjustmentPage() {
  const ctx = await requireContext();
  const [items, expense, income] = await Promise.all([
    listInventoryItems(ctx.orgId),
    accountsByType(ctx.orgId, "EXPENSE"),
    accountsByType(ctx.orgId, "INCOME"),
  ]);

  const adjustmentAccounts = [...expense, ...income].map((a) => ({
    id: a.id,
    label: `${a.code} — ${a.name}`,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/inventory-adjustments"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to adjustments
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New Inventory Quantity Adjustment</h1>
      <p className="text-sm text-slate-500">
        Correct stock counts after a physical count. Enter each item&apos;s counted
        quantity — the value difference posts to your chosen gain/loss account.
      </p>

      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You have no inventory items yet. Add one in{" "}
          <Link href="/inventory-items" className="underline">
            Inventory Items
          </Link>{" "}
          first.
        </p>
      ) : (
        <InventoryAdjustmentForm
          items={items.map((it) => ({
            id: it.id,
            label: `${it.code} — ${it.name}`,
            onHand: it.qtyOnHand.toString(),
          }))}
          adjustmentAccounts={adjustmentAccounts}
        />
      )}
    </div>
  );
}

import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { listParties } from "@/lib/parties";
import { listInventoryItems } from "@/lib/inventory";
import { GoodsReceiptForm } from "@/components/GoodsReceiptForm";

export default async function NewGoodsReceiptPage() {
  const ctx = await requireContext();
  const [suppliers, items] = await Promise.all([
    listParties(ctx.orgId, "supplier"),
    listInventoryItems(ctx.orgId),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/goods-receipts" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to goods receipts
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New Goods Receipt</h1>
      <p className="text-sm text-slate-500">
        Receive stock from a supplier. Updates each item&apos;s quantity and
        weighted-average cost.
      </p>

      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Add at least one item in{" "}
          <Link href="/inventory-items" className="underline">
            Inventory Items
          </Link>{" "}
          first.
        </p>
      ) : (
        <GoodsReceiptForm
          currency={ctx.baseCurrency}
          suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
          items={items.map((it) => ({ id: it.id, label: `${it.code} — ${it.name}` }))}
        />
      )}
    </div>
  );
}

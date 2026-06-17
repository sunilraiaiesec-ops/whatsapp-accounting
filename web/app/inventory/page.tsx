import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { StockEntryControl } from "@/components/StockEntryControl";
import { serverApi } from "@/lib/server-api";

type InventoryItem = {
  id: number;
  name: string;
  default_unit: string | null;
  on_hand: number;
  movement_count: number;
};

type InventoryResponse = {
  items: InventoryItem[];
  count: number;
};

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export default async function InventoryPage() {
  const data = await serverApi<InventoryResponse>("inventory");
  const tracked = data.items.filter((item) => item.movement_count > 0).length;
  const negative = data.items.filter((item) => item.on_hand < 0).length;

  return (
    <AppShell
      title="Inventory"
      subtitle="Current stock on hand (quantity only)"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-6 text-sm text-slate-600">
          <span>
            <span className="font-semibold text-slate-900">{data.count}</span> products
          </span>
          <span>
            <span className="font-semibold text-slate-900">{tracked}</span> with movements
          </span>
          {negative > 0 ? (
            <span className="text-red-600">
              <span className="font-semibold">{negative}</span> below zero
            </span>
          ) : null}
        </div>
        <Link
          href="/inventory/opening"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Set opening balances
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3">Add stock (goods received)</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3">{item.default_unit ?? "—"}</td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    item.on_hand < 0 ? "text-red-600" : "text-slate-900"
                  }`}
                >
                  {formatQty(item.on_hand)}
                </td>
                <td className="px-4 py-3">
                  <StockEntryControl
                    productId={item.id}
                    mode="receipt"
                    unit={item.default_unit}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No products yet. Products appear here once they exist in your catalog.
        </p>
      ) : null}
    </AppShell>
  );
}

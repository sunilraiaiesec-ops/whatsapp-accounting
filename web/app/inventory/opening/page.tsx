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

export default async function OpeningBalancesPage() {
  const data = await serverApi<InventoryResponse>("inventory");

  return (
    <AppShell
      title="Opening balances"
      subtitle="Enter the current physical count for each product to seed stock"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          Setting an opening balance records a one-time starting count. Re-entering a value
          replaces the previous opening count for that product — use “Add stock” on the
          Inventory page for ongoing goods received.
        </p>
        <Link
          href="/inventory"
          className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to inventory
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3 text-right">Current on hand</th>
              <th className="px-4 py-3">Opening count + unit cost</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3">{item.default_unit ?? "—"}</td>
                <td className="px-4 py-3 text-right text-slate-500">
                  {formatQty(item.on_hand)}
                </td>
                <td className="px-4 py-3">
                  <StockEntryControl
                    productId={item.id}
                    mode="opening"
                    unit={item.default_unit}
                    withCost
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No products yet.</p>
      ) : null}
    </AppShell>
  );
}

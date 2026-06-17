import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { StockEntryControl } from "@/components/StockEntryControl";
import { serverApi } from "@/lib/server-api";

type InventoryItem = {
  id: number;
  name: string;
  default_unit: string | null;
  on_hand: number;
  avg_cost: number;
  stock_value: number;
  movement_count: number;
};

type InventoryResponse = {
  items: InventoryItem[];
  count: number;
  total_stock_value: number;
  total_cogs: number;
};

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatFcfa(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default async function InventoryPage() {
  const data = await serverApi<InventoryResponse>("inventory");
  const tracked = data.items.filter((item) => item.movement_count > 0).length;
  const negative = data.items.filter((item) => item.on_hand < 0).length;

  return (
    <AppShell
      title="Inventory"
      subtitle="Stock on hand and weighted-average value (FCFA)"
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Inventory value
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatFcfa(data.total_stock_value)} FCFA
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            COGS to date
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatFcfa(data.total_cogs)} FCFA
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Products</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {data.count}
            <span className="ml-2 text-sm font-normal text-slate-500">
              {tracked} active
            </span>
          </p>
          {negative > 0 ? (
            <p className="mt-1 text-xs text-red-600">{negative} below zero</p>
          ) : null}
        </div>
      </div>

      <div className="mb-4 flex justify-end">
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
              <th className="px-4 py-3 text-right">Avg cost</th>
              <th className="px-4 py-3 text-right">Value</th>
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
                <td className="px-4 py-3 text-right text-slate-600">
                  {item.avg_cost > 0 ? formatFcfa(item.avg_cost) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {item.avg_cost > 0 ? formatFcfa(item.stock_value) : "—"}
                </td>
                <td className="px-4 py-3">
                  <StockEntryControl
                    productId={item.id}
                    mode="receipt"
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
        <p className="mt-4 text-sm text-slate-500">
          No products yet. Products appear here once they exist in your catalog.
        </p>
      ) : null}
    </AppShell>
  );
}

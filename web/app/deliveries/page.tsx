import { AppShell } from "@/components/AppShell";
import { formatDate, formatFcfa, formatNumber, statusBadgeClass } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { Delivery } from "@/lib/types";

type DeliveriesResponse = {
  items: Delivery[];
  count: number;
};

export default async function DeliveriesPage() {
  const data = await serverApi<DeliveriesResponse>("deliveries?limit=100");

  return (
    <AppShell title="Deliveries" subtitle={`${data.count} recent delivery notes`}>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Doc #</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((delivery) => (
              <tr key={delivery.id} className="border-t border-slate-100">
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(delivery.delivery_date ?? delivery.created_at)}
                </td>
                <td className="px-4 py-3">{delivery.client_name ?? "—"}</td>
                <td className="px-4 py-3">{delivery.product_name ?? delivery.description ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {delivery.quantity != null
                    ? `${formatNumber(delivery.quantity)} ${delivery.quantity_unit ?? ""}`.trim()
                    : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatFcfa(delivery.line_total_fcfa)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(delivery.status)}`}
                  >
                    {delivery.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">{delivery.document_number ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

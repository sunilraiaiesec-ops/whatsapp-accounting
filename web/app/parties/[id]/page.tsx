import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { formatDate, formatFcfa, formatNumber, statusBadgeClass } from "@/lib/format";
import { serverApi } from "@/lib/server-api";

type PartyDetail = {
  id: number;
  name: string;
  party_type: string;
  total_received: number;
  total_paid: number;
  total_goods_value: number;
  amount_owed: number;
  net_cash: number;
  transactions: Array<{
    id: number;
    transaction_type: string;
    amount: number | null;
    status: string;
    original_message: string | null;
    created_at: string;
  }>;
  deliveries: Array<{
    id: number;
    document_number: string | null;
    description: string | null;
    quantity: number | null;
    line_total_fcfa: number | null;
    status: string;
    created_at: string;
    product_name: string | null;
  }>;
};

export default async function PartyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const party = await serverApi<PartyDetail>(`parties/${id}`);

  return (
    <AppShell title={party.name} subtitle={`${party.party_type} party`}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Amount owed" value={formatFcfa(party.amount_owed)} tone={party.amount_owed > 0 ? "warning" : "default"} />
        <StatCard label="Goods delivered" value={formatFcfa(party.total_goods_value)} />
        <StatCard label="Cash received" value={formatFcfa(party.total_received)} />
        <StatCard label="Net cash" value={formatFcfa(party.net_cash)} />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Recent transactions</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {party.transactions.map((tx) => (
                <tr key={tx.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{formatDate(tx.created_at)}</td>
                  <td className="px-4 py-3 capitalize">{tx.transaction_type}</td>
                  <td className="px-4 py-3">{formatFcfa(tx.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(tx.status)}`}>
                      {tx.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="max-w-sm truncate px-4 py-3">{tx.original_message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Recent deliveries</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {party.deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{formatDate(delivery.created_at)}</td>
                  <td className="px-4 py-3">{delivery.product_name ?? delivery.description ?? "—"}</td>
                  <td className="px-4 py-3">{formatNumber(delivery.quantity)}</td>
                  <td className="px-4 py-3">{formatFcfa(delivery.line_total_fcfa)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(delivery.status)}`}>
                      {delivery.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

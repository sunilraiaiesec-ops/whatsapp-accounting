import { AppShell } from "@/components/AppShell";
import { formatDate, formatFcfa, statusBadgeClass } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { Transaction } from "@/lib/types";

type TransactionsResponse = {
  items: Transaction[];
  count: number;
};

export default async function TransactionsPage() {
  const data = await serverApi<TransactionsResponse>("transactions?limit=100");

  return (
    <AppShell title="Transactions" subtitle={`${data.count} recent entries`}>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Message</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((tx) => (
              <tr key={tx.id} className="border-t border-slate-100">
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(tx.created_at)}
                </td>
                <td className="px-4 py-3 capitalize">{tx.transaction_type}</td>
                <td className="px-4 py-3">{tx.party ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatFcfa(tx.amount)}
                </td>
                <td className="px-4 py-3">{tx.category ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(tx.status)}`}
                  >
                    {tx.status.replace("_", " ")}
                  </span>
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                  {tx.original_message ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

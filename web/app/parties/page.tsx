import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { formatFcfa } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { Party } from "@/lib/types";

type PartiesResponse = {
  items: Party[];
  count: number;
};

export default async function PartiesPage() {
  const data = await serverApi<PartiesResponse>("parties");
  const withOwed = data.items.filter((party) => party.amount_owed > 0).length;

  return (
    <AppShell
      title="Parties"
      subtitle={`${data.count} clients and suppliers`}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total parties" value={String(data.count)} />
        <StatCard label="With deliveries" value={String(data.items.filter((p) => p.delivery_count > 0).length)} />
        <StatCard label="Owing money" value={String(withOwed)} tone={withOwed > 0 ? "warning" : "default"} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Goods value</th>
              <th className="px-4 py-3">Amount owed</th>
              <th className="px-4 py-3">Deliveries</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((party) => (
              <tr key={party.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link
                    href={`/parties/${party.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {party.name}
                  </Link>
                </td>
                <td className="px-4 py-3 capitalize">{party.party_type}</td>
                <td className="px-4 py-3">{formatFcfa(party.total_received)}</td>
                <td className="px-4 py-3">{formatFcfa(party.total_goods_value)}</td>
                <td className="px-4 py-3 font-medium">
                  {formatFcfa(party.amount_owed)}
                </td>
                <td className="px-4 py-3">{party.delivery_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

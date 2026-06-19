import Link from "next/link";

import type { PartyLedgerRow } from "@/lib/party-ledger";
import { formatAmount } from "@/lib/money";

export function PartyLedgerTable({
  rows,
  currency,
  emptyMessage,
  columns,
}: {
  rows: PartyLedgerRow[];
  currency: string;
  emptyMessage: string;
  columns: {
    date: string;
    description: string;
    reference: string;
    debit: string;
    credit: string;
    balance: string;
  };
}) {
  if (rows.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-[var(--muted)]">{emptyMessage}</p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="px-4 py-2 font-medium">{columns.date}</th>
          <th className="px-4 py-2 font-medium">{columns.description}</th>
          <th className="px-4 py-2 font-medium">{columns.reference}</th>
          <th className="px-4 py-2 text-right font-medium">{columns.debit}</th>
          <th className="px-4 py-2 text-right font-medium">{columns.credit}</th>
          <th className="px-4 py-2 text-right font-medium">{columns.balance}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
          >
            <td className="px-4 py-2 whitespace-nowrap text-slate-700">
              {row.date.toISOString().slice(0, 10)}
            </td>
            <td className="px-4 py-2 text-slate-900">
              {row.href ? (
                <Link href={row.href} className="font-medium text-[var(--brand)] hover:underline">
                  {row.label}
                </Link>
              ) : (
                row.label
              )}
            </td>
            <td className="px-4 py-2 text-slate-600">{row.reference ?? "—"}</td>
            <td className="px-4 py-2 text-right tabular-nums">
              {row.debit > 0n ? formatAmount(row.debit, currency) : ""}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              {row.credit > 0n ? formatAmount(row.credit, currency) : ""}
            </td>
            <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-900">
              {formatAmount(row.balance, currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

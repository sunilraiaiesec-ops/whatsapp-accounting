import Link from "next/link";

import { ReportBackLink } from "@/components/ReportBackLink";
import { requireContext } from "@/lib/auth/current";
import { formatAmount } from "@/lib/money";
import { payablesAging, type AgingRow } from "@/lib/reports";

function AgingTable({
  rows,
  totals,
  cur,
  partyHref,
}: {
  rows: AgingRow[];
  totals: AgingRow;
  cur: string;
  partyHref: (id: string) => string;
}) {
  const cols = [
    { key: "current" as const, label: "Current" },
    { key: "days1_30" as const, label: "1–30 days" },
    { key: "days31_60" as const, label: "31–60 days" },
    { key: "days61_90" as const, label: "61–90 days" },
    { key: "over90" as const, label: "90+ days" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-medium">Name</th>
            {cols.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right font-medium">
                {c.label}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.partyId} className="border-b border-slate-100">
              <td className="px-3 py-2">
                <Link href={partyHref(row.partyId)} className="font-medium text-[var(--brand)] hover:underline">
                  {row.partyName}
                </Link>
              </td>
              {cols.map((c) => (
                <td key={c.key} className="px-3 py-2 text-right tabular-nums">
                  {row[c.key] === 0n ? "—" : formatAmount(row[c.key], cur)}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums font-medium">
                {formatAmount(row.total, cur)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <td className="px-3 py-2">{totals.partyName}</td>
            {cols.map((c) => (
              <td key={c.key} className="px-3 py-2 text-right tabular-nums">
                {formatAmount(totals[c.key], cur)}
              </td>
            ))}
            <td className="px-3 py-2 text-right tabular-nums">{formatAmount(totals.total, cur)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default async function ApAgingReportPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const { asOf, rows, totals } = await payablesAging(ctx.orgId);

  return (
    <div className="mx-auto max-w-5xl">
      <ReportBackLink />
      <h1 className="mt-2 text-2xl font-semibold">Accounts Payable Aging</h1>
      <p className="text-sm text-[var(--muted)]">
        Unpaid purchase invoices as of {asOf.toISOString().slice(0, 10)}.
      </p>

      <div className="mt-6 card-surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--muted)]">No unpaid supplier bills.</p>
        ) : (
          <AgingTable rows={rows} totals={totals} cur={cur} partyHref={(id) => `/suppliers/${id}`} />
        )}
      </div>
    </div>
  );
}

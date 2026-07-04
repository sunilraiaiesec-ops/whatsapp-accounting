import Link from "next/link";

import { ReportBackLink } from "@/components/ReportBackLink";
import { PrintButton } from "@/components/PrintButton";
import { requireContext } from "@/lib/auth/current";
import { formatAmount } from "@/lib/money";
import { isoDate } from "@/lib/format";
import { listParties } from "@/lib/parties";
import { getParty, getPartyLedger, type PartyLedgerRow } from "@/lib/party-ledger";

const SOURCE_LABELS = {
  sales_invoice: "Invoice",
  receipt: "Receipt",
  credit_note: "Credit note",
  purchase_invoice: "Purchase invoice",
  payment: "Payment",
  debit_note: "Debit note",
};

export default async function CustomerStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ partyId?: string; from?: string; to?: string }>;
}) {
  const { partyId, from, to } = await searchParams;
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const customers = await listParties(ctx.orgId, "customer");

  let party: Awaited<ReturnType<typeof getParty>> = null;
  let periodRows: PartyLedgerRow[] = [];
  let opening = 0n;
  let closing = 0n;
  let periodDebit = 0n;
  let periodCredit = 0n;

  if (partyId) {
    const found = await getParty(ctx.orgId, partyId);
    if (found && (found.type === "customer" || found.type === "both")) {
      party = found;
      const { rows } = await getPartyLedger(ctx.orgId, partyId, "customer", SOURCE_LABELS);
      const fromKey = from || null;
      const toKey = to || null;

      for (const row of rows) {
        if (fromKey && isoDate(row.date) < fromKey) opening = row.balance;
      }

      periodRows = rows.filter((row) => {
        const key = isoDate(row.date);
        if (fromKey && key < fromKey) return false;
        if (toKey && key > toKey) return false;
        return true;
      });

      for (const row of periodRows) {
        periodDebit += row.debit;
        periodCredit += row.credit;
      }

      closing = periodRows.length
        ? periodRows[periodRows.length - 1]!.balance
        : opening;
    }
  }

  const inputClass =
    "rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700 focus:border-[var(--brand)] focus:outline-none";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="print:hidden">
        <ReportBackLink />
        <h1 className="mt-2 text-2xl font-semibold">Customer Statement</h1>
        <p className="text-sm text-[var(--muted)]">
          A customer&apos;s invoices, payments and running balance over a period.
        </p>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">Customer</span>
            <select name="partyId" defaultValue={partyId ?? ""} className={inputClass}>
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">From</span>
            <input type="date" name="from" defaultValue={from ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">To</span>
            <input type="date" name="to" defaultValue={to ?? ""} className={inputClass} />
          </label>
          <button type="submit" className="btn-brand text-sm">
            View
          </button>
          {party ? <PrintButton label="Print / PDF" /> : null}
        </form>
      </div>

      {!party ? (
        <p className="mt-8 rounded-xl border border-dashed border-[var(--border)] bg-slate-50 p-8 text-center text-sm text-[var(--muted)] print:hidden">
          Choose a customer above to generate their statement.
        </p>
      ) : (
        <div className="mt-6 card-surface overflow-hidden print:border-0 print:shadow-none">
          <div className="flex flex-col gap-4 border-b border-[var(--border)] px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-900">{ctx.orgName}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Statement for
              </p>
              <p className="text-base font-medium text-slate-900">{party.name}</p>
              {party.phone ? (
                <p className="text-sm text-[var(--muted)]">{party.phone}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Period
              </p>
              <p className="text-sm text-slate-700">
                {from ? from : "Beginning"} — {to ? to : isoDate(new Date())}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Balance due
              </p>
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                {formatAmount(closing, cur)}{" "}
                <span className="text-base font-medium text-slate-500">{cur}</span>
              </p>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Reference</th>
                <th className="px-4 py-2 text-right font-medium">Charges</th>
                <th className="px-4 py-2 text-right font-medium">Payments</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 bg-slate-50/40">
                <td className="px-4 py-2 text-slate-500" colSpan={5}>
                  Opening balance
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {formatAmount(opening, cur)}
                </td>
              </tr>
              {periodRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                    No transactions in this period.
                  </td>
                </tr>
              ) : (
                periodRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-4 py-2 tabular-nums text-slate-600">
                      {isoDate(row.date)}
                    </td>
                    <td className="px-4 py-2">
                      {row.href ? (
                        <Link href={row.href} className="text-[var(--brand)] hover:underline">
                          {row.label}
                        </Link>
                      ) : (
                        row.label
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{row.reference ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.debit > 0n ? formatAmount(row.debit, cur) : ""}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.credit > 0n ? formatAmount(row.credit, cur) : ""}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {formatAmount(row.balance, cur)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border)] bg-slate-50 font-semibold">
                <td className="px-4 py-2" colSpan={3}>
                  Closing balance
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(periodDebit, cur)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(periodCredit, cur)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(closing, cur)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

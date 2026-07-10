import { formatAmount } from "@/lib/money";

// Live Dr/Cr preview of a journal entry before it posts — shared by the fixed
// asset purchase, depreciation, and disposal forms (and reusable anywhere
// else a "here's what this will post" preview is useful). Pure/stateless, so
// it can be rendered from server or client components.
export type AccountingPreviewLine = {
  label: string;
  debit?: bigint;
  credit?: bigint;
};

export function AccountingPreview({
  lines,
  currency,
  title = "Journal entry preview",
}: {
  lines: AccountingPreviewLine[];
  currency: string;
  title?: string;
}) {
  const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0n), 0n);
  const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0n), 0n);
  const balanced = totalDebit === totalCredit && totalDebit > 0n;

  return (
    <div className="card-surface overflow-hidden">
      <p className="border-b border-[var(--border)] bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 font-medium">Account</th>
            <th className="w-32 px-4 py-2 text-right font-medium">Debit</th>
            <th className="w-32 px-4 py-2 text-right font-medium">Credit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2">{l.label}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {l.debit && l.debit > 0n ? formatAmount(l.debit, currency) : ""}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {l.credit && l.credit > 0n ? formatAmount(l.credit, currency) : ""}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <td className="px-4 py-2">Total</td>
            <td className="px-4 py-2 text-right tabular-nums">
              {formatAmount(totalDebit, currency)}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              {formatAmount(totalCredit, currency)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className={`px-4 py-2 text-xs ${balanced ? "text-emerald-600" : "text-slate-400"}`}>
        {balanced ? "Debits equal credits ✓" : "Fill in the amounts to preview the entry."}
      </p>
    </div>
  );
}

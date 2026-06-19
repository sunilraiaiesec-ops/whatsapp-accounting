import { requireContext } from "@/lib/auth/current";
import { balanceSheet, type AccountAmount } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

type Line = AccountAmount & { amount: bigint };

export default async function BalanceSheetPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const bs = await balanceSheet(ctx.orgId);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Balance Sheet</h1>
      <p className="text-sm text-slate-500">
        As of {bs.asOf.toISOString().slice(0, 10)} · all amounts in {cur}.
      </p>

      <div className="mt-6 space-y-6">
        <Section title="Assets" lines={bs.assets as Line[]} total={bs.totalAssets} cur={cur} />

        <Section
          title="Liabilities"
          lines={bs.liabilities as Line[]}
          total={bs.totalLiabilities}
          cur={cur}
        />

        <Section
          title="Equity"
          lines={bs.equity as Line[]}
          total={bs.totalEquity}
          cur={cur}
          extra={{ label: "Current period earnings", amount: bs.currentEarnings }}
        />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Total assets</span>
          <span className="font-semibold tabular-nums">
            {formatAmount(bs.totalAssets, cur)}
          </span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-slate-600">Liabilities + equity</span>
          <span className="font-semibold tabular-nums">
            {formatAmount(bs.totalLiabilities + bs.totalEquity, cur)}
          </span>
        </div>
        <p
          className={`mt-2 ${bs.balanced ? "text-emerald-600" : "text-red-600"}`}
        >
          {bs.balanced ? "Balanced ✓" : "Out of balance ✗"}
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  lines,
  total,
  cur,
  extra,
}: {
  title: string;
  lines: Line[];
  total: bigint;
  cur: string;
  extra?: { label: string; amount: bigint };
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-100">
              <td className="px-4 py-2">
                <span className="font-mono text-xs text-slate-400">{l.code}</span>{" "}
                {l.name}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(l.amount, cur)}
              </td>
            </tr>
          ))}
          {extra && extra.amount !== 0n ? (
            <tr className="border-b border-slate-100">
              <td className="px-4 py-2 italic text-slate-600">{extra.label}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(extra.amount, cur)}
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <td className="px-4 py-2">Total {title.toLowerCase()}</td>
            <td className="px-4 py-2 text-right tabular-nums">
              {formatAmount(total, cur)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

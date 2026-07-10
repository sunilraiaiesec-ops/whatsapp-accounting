import Link from "next/link";

import { ReportBackLink } from "@/components/ReportBackLink";
import { requireContext } from "@/lib/auth/current";
import { formatAmount } from "@/lib/money";
import { isoDate } from "@/lib/format";
import {
  fixedAssetDepreciationReport,
  fixedAssetDisposalReport,
  fixedAssetRegister,
} from "@/lib/reports";

type TabKey = "register" | "depreciation" | "disposals";
const TAB_LABELS: Record<TabKey, string> = {
  register: "Asset Register",
  depreciation: "Depreciation",
  disposals: "Disposals",
};
const VALID_TABS = new Set<TabKey>(["register", "depreciation", "disposals"]);

export default async function FixedAssetReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = VALID_TABS.has(rawTab as TabKey) ? (rawTab as TabKey) : "register";

  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  return (
    <div className="mx-auto max-w-4xl">
      <ReportBackLink />
      <h1 className="mt-2 text-2xl font-semibold">Fixed Asset Reports</h1>
      <p className="text-sm text-[var(--muted)]">All amounts in {cur}.</p>

      <div className="mt-4 flex gap-1 border-b border-[var(--border)]">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
          <Link
            key={key}
            href={`/reports/fixed-assets?tab=${key}`}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === key
                ? "border-b-2 border-[var(--brand)] text-[var(--brand)]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {TAB_LABELS[key]}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {tab === "register" ? <RegisterTab orgId={ctx.orgId} currency={cur} /> : null}
        {tab === "depreciation" ? <DepreciationTab orgId={ctx.orgId} currency={cur} /> : null}
        {tab === "disposals" ? <DisposalsTab orgId={ctx.orgId} currency={cur} /> : null}
      </div>
    </div>
  );
}

async function RegisterTab({ orgId, currency }: { orgId: string; currency: string }) {
  const { rows, totalCost, totalAccumulatedDepreciation, totalBookValue } =
    await fixedAssetRegister(orgId);

  if (rows.length === 0) {
    return <p className="p-8 text-center text-sm text-[var(--muted)]">No fixed assets yet.</p>;
  }

  return (
    <div className="card-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 font-medium">Code</th>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Category</th>
            <th className="px-4 py-2 font-medium">Purchased</th>
            <th className="px-4 py-2 font-medium">In service</th>
            <th className="px-4 py-2 text-right font-medium">Cost</th>
            <th className="px-4 py-2 text-right font-medium">Accum. deprec.</th>
            <th className="px-4 py-2 text-right font-medium">Book value</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2 font-mono text-xs text-slate-400">{r.code}</td>
              <td className="px-4 py-2">{r.name}</td>
              <td className="px-4 py-2 text-xs text-slate-500">{r.category ?? "—"}</td>
              <td className="px-4 py-2 text-xs text-slate-500">{isoDate(r.purchaseDate)}</td>
              <td className="px-4 py-2 text-xs text-slate-500">{isoDate(r.placedInServiceDate)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(r.cost, currency)}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(r.accumulatedDepreciation, currency)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-medium">
                {formatAmount(r.bookValue, currency)}
              </td>
              <td className="px-4 py-2 text-xs text-slate-500">
                {r.status === "ACTIVE" ? "Active" : "Disposed"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <td className="px-4 py-2" colSpan={5}>
              Total
            </td>
            <td className="px-4 py-2 text-right tabular-nums">{formatAmount(totalCost, currency)}</td>
            <td className="px-4 py-2 text-right tabular-nums">
              {formatAmount(totalAccumulatedDepreciation, currency)}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              {formatAmount(totalBookValue, currency)}
            </td>
            <td className="px-4 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

async function DepreciationTab({ orgId, currency }: { orgId: string; currency: string }) {
  const { rows, totalDepreciation } = await fixedAssetDepreciationReport(orgId);

  if (rows.length === 0) {
    return <p className="p-8 text-center text-sm text-[var(--muted)]">No depreciation posted yet.</p>;
  }

  return (
    <div className="card-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 font-medium">Asset</th>
            <th className="px-4 py-2 font-medium">Period</th>
            <th className="px-4 py-2 text-right font-medium">Depreciation posted</th>
            <th className="px-4 py-2 text-right font-medium">Accum. deprec.</th>
            <th className="px-4 py-2 text-right font-medium">Book value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.scheduleId} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2">
                <span className="font-mono text-xs text-slate-400">{r.asset.code}</span> {r.asset.name}
              </td>
              <td className="px-4 py-2 text-xs text-slate-500">
                {isoDate(r.periodStart)} – {isoDate(r.periodEnd)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(r.depreciationPosted, currency)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatAmount(r.accumulatedDepreciation, currency)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(r.bookValue, currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <td className="px-4 py-2" colSpan={2}>
              Total depreciation posted
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              {formatAmount(totalDepreciation, currency)}
            </td>
            <td className="px-4 py-2" colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

async function DisposalsTab({ orgId, currency }: { orgId: string; currency: string }) {
  const { rows } = await fixedAssetDisposalReport(orgId);

  if (rows.length === 0) {
    return <p className="p-8 text-center text-sm text-[var(--muted)]">No disposals yet.</p>;
  }

  return (
    <div className="card-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 font-medium">Asset</th>
            <th className="px-4 py-2 font-medium">Disposal date</th>
            <th className="px-4 py-2 text-right font-medium">Proceeds</th>
            <th className="px-4 py-2 text-right font-medium">Book value</th>
            <th className="px-4 py-2 text-right font-medium">Gain / (loss)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2">
                <span className="font-mono text-xs text-slate-400">{r.code}</span> {r.name}
              </td>
              <td className="px-4 py-2 text-xs text-slate-500">{isoDate(r.disposalDate)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(r.proceeds, currency)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(r.bookValue, currency)}</td>
              <td
                className={`px-4 py-2 text-right tabular-nums font-medium ${
                  r.gainOrLoss >= 0n ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {formatAmount(r.gainOrLoss, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

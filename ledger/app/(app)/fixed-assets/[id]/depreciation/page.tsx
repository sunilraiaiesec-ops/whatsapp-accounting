import Link from "next/link";
import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { can } from "@/lib/permissions";
import { getFixedAsset } from "@/lib/fixed-assets/assets";
import { formatAmount } from "@/lib/money";
import { isoDate } from "@/lib/format";
import { FixedAssetActionButton } from "@/components/FixedAssetActionButton";
import { postDepreciationPeriodAction, postDuePeriodsAction } from "@/app/actions/fixed-assets";

export default async function FixedAssetDepreciationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const canManage = can(ctx.role, "manageFixedAssets");

  const asset = await getFixedAsset(ctx.orgId, id);
  if (!asset) notFound();

  const now = new Date();
  const duePeriods = asset.schedule.filter(
    (p) => p.status === "SCHEDULED" && p.periodEnd.getTime() <= now.getTime(),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/fixed-assets/${asset.id}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to {asset.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Depreciation schedule</h1>
      <p className="text-sm text-slate-500">
        {asset.code} · {asset.name} · {asset.usefulLifeMonths} month
        {asset.depreciationMethod === "STRAIGHT_LINE" ? " straight-line" : " declining-balance"}{" "}
        schedule from {isoDate(asset.placedInServiceDate)}.
      </p>

      {asset.status === "DISPOSED" ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          This asset was disposed on {asset.disposalDate ? isoDate(asset.disposalDate) : "—"}. Its
          remaining scheduled periods were skipped and can no longer be posted.
        </p>
      ) : null}

      {canManage && asset.status === "ACTIVE" && duePeriods.length > 0 ? (
        <div className="mt-4">
          <FixedAssetActionButton
            action={postDuePeriodsAction}
            hiddenFields={{ assetId: asset.id }}
            label={`Post all ${duePeriods.length} due period${duePeriods.length === 1 ? "" : "s"}`}
            pendingLabel="Posting…"
          />
        </div>
      ) : null}

      <div className="mt-4 card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 text-right font-medium">Depreciation</th>
              <th className="px-4 py-2 text-right font-medium">Accum. deprec.</th>
              <th className="px-4 py-2 text-right font-medium">Book value</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {asset.schedule.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">
                  {isoDate(p.periodStart)} – {isoDate(p.periodEnd)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(p.depreciationAmount, cur)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(p.accumulatedDepreciationAfter, cur)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatAmount(p.bookValueAfter, cur)}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{p.status}</td>
                <td className="px-4 py-2 text-right">
                  {canManage && p.status === "SCHEDULED" && asset.status === "ACTIVE" ? (
                    <FixedAssetActionButton
                      action={postDepreciationPeriodAction}
                      hiddenFields={{ scheduleId: p.id, assetId: asset.id }}
                      label="Post"
                      pendingLabel="Posting…"
                      variant="outline"
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

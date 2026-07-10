import Link from "next/link";
import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { can } from "@/lib/permissions";
import { getFixedAsset } from "@/lib/fixed-assets/assets";
import { formatAmount } from "@/lib/money";
import { isoDate } from "@/lib/format";
import { AccountingPreview } from "@/components/ui/AccountingPreview";
import { FixedAssetActionButton } from "@/components/FixedAssetActionButton";
import { postDuePeriodsAction, deleteFixedAssetAction } from "@/app/actions/fixed-assets";

export default async function FixedAssetDetailPage({
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

  const bookValue = asset.purchaseCost - asset.accumulatedDepreciation;
  const now = new Date();
  const duePeriods = asset.schedule.filter(
    (p) => p.status === "SCHEDULED" && p.periodEnd.getTime() <= now.getTime(),
  );
  const canDelete = asset.status === "ACTIVE" && asset.accumulatedDepreciation === 0n;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/fixed-assets" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to fixed assets
      </Link>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {asset.name}{" "}
            <span
              className={`ml-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                asset.status === "ACTIVE"
                  ? "bg-[var(--brand)]/10 text-[var(--brand)]"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {asset.status === "ACTIVE" ? "Active" : "Disposed"}
            </span>
          </h1>
          <p className="text-sm text-slate-500">
            {asset.code} · {asset.category?.name ?? "No category"}
            {asset.party ? ` · ${asset.party.name}` : ""}
          </p>
        </div>
        {canManage && asset.status === "ACTIVE" ? (
          <div className="flex gap-2">
            <Link
              href={`/fixed-assets/${asset.id}/dispose`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Dispose
            </Link>
            <Link
              href={`/fixed-assets/${asset.id}/depreciation`}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Depreciation
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card-surface p-4">
          <p className="text-xs font-medium text-[var(--muted)]">Cost</p>
          <p className="mt-1 text-lg font-semibold">{formatAmount(asset.purchaseCost, cur)}</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-xs font-medium text-[var(--muted)]">Accumulated depreciation</p>
          <p className="mt-1 text-lg font-semibold">
            {formatAmount(asset.accumulatedDepreciation, cur)}
          </p>
        </div>
        <div className="card-surface p-4">
          <p className="text-xs font-medium text-[var(--muted)]">Book value</p>
          <p className="mt-1 text-lg font-semibold">{formatAmount(bookValue, cur)}</p>
        </div>
      </div>

      <div className="mt-6 card-surface p-4 text-sm">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--muted)]">Purchase date</dt>
            <dd>{isoDate(asset.purchaseDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Placed in service</dt>
            <dd>{isoDate(asset.placedInServiceDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Useful life</dt>
            <dd>{asset.usefulLifeMonths} months</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Depreciation method</dt>
            <dd>
              {asset.depreciationMethod === "STRAIGHT_LINE" ? "Straight line" : "Declining balance"}
              {asset.decliningBalanceRate ? ` (${Number(asset.decliningBalanceRate)}%/yr)` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Salvage value</dt>
            <dd>{formatAmount(asset.salvageValue, cur)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Reference</dt>
            <dd>{asset.reference ?? "—"}</dd>
          </div>
        </dl>
        {asset.notes ? <p className="mt-3 text-slate-500">{asset.notes}</p> : null}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Purchase journal entry
      </h2>
      <div className="mt-2">
        <AccountingPreview
          currency={cur}
          lines={[
            { label: `${asset.fixedAssetAccount.code} — ${asset.fixedAssetAccount.name}`, debit: asset.purchaseCost },
            { label: `${asset.sourceAccount.code} — ${asset.sourceAccount.name}`, credit: asset.purchaseCost },
          ]}
        />
      </div>

      {asset.status === "DISPOSED" ? (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Disposal
          </h2>
          <div className="mt-2 card-surface p-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[var(--muted)]">Disposal date</dt>
                <dd>{asset.disposalDate ? isoDate(asset.disposalDate) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Proceeds</dt>
                <dd>{formatAmount(asset.disposalProceeds ?? 0n, cur)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Gain / (loss)</dt>
                <dd
                  className={
                    (asset.disposalGainLoss ?? 0n) >= 0n ? "text-emerald-600" : "text-red-600"
                  }
                >
                  {formatAmount(asset.disposalGainLoss ?? 0n, cur)}
                </dd>
              </div>
            </dl>
            {asset.disposalNotes ? <p className="mt-3 text-slate-500">{asset.disposalNotes}</p> : null}
          </div>
        </>
      ) : null}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Depreciation schedule
        </h2>
        <Link
          href={`/fixed-assets/${asset.id}/depreciation`}
          className="text-sm text-[var(--brand)] hover:underline"
        >
          View full schedule →
        </Link>
      </div>

      {canManage && asset.status === "ACTIVE" && duePeriods.length > 0 ? (
        <div className="mt-3">
          <FixedAssetActionButton
            action={postDuePeriodsAction}
            hiddenFields={{ assetId: asset.id }}
            label={`Post ${duePeriods.length} due period${duePeriods.length === 1 ? "" : "s"}`}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage ? (
        <div className="mt-8 flex items-center gap-3">
          <Link
            href={`/fixed-assets/${asset.id}/edit`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </Link>
          {canDelete ? (
            <FixedAssetActionButton
              action={deleteFixedAssetAction}
              hiddenFields={{ id: asset.id }}
              label="Delete"
              pendingLabel="Deleting…"
              variant="danger"
              confirmMessage="Delete this asset? This reverses its purchase journal entry."
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

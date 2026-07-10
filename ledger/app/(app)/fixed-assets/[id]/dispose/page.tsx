import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { can } from "@/lib/permissions";
import { bankAndCashAccounts } from "@/lib/accounts";
import { getFixedAsset } from "@/lib/fixed-assets/assets";
import { formatAmount } from "@/lib/money";
import { FixedAssetDisposalForm } from "@/components/FixedAssetDisposalForm";

export default async function DisposeFixedAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) notFound();

  const asset = await getFixedAsset(ctx.orgId, id);
  if (!asset) notFound();
  if (asset.status !== "ACTIVE") redirect(`/fixed-assets/${asset.id}`);

  const receivingAccounts = await bankAndCashAccounts(ctx.orgId);
  const bookValue = asset.purchaseCost - asset.accumulatedDepreciation;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/fixed-assets/${asset.id}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to {asset.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Dispose of {asset.name}</h1>
      <p className="text-sm text-slate-500">
        Cost {formatAmount(asset.purchaseCost, ctx.baseCurrency)} · accumulated depreciation{" "}
        {formatAmount(asset.accumulatedDepreciation, ctx.baseCurrency)} · book value{" "}
        {formatAmount(bookValue, ctx.baseCurrency)}.
      </p>

      <FixedAssetDisposalForm
        assetId={asset.id}
        currency={ctx.baseCurrency}
        purchaseCost={asset.purchaseCost.toString()}
        accumulatedDepreciation={asset.accumulatedDepreciation.toString()}
        fixedAssetAccountLabel={`${asset.fixedAssetAccount.code} — ${asset.fixedAssetAccount.name}`}
        accumulatedDeprecAccountLabel={`${asset.accumulatedDeprecAccount.code} — ${asset.accumulatedDeprecAccount.name}`}
        receivingAccounts={receivingAccounts.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
        }))}
      />
    </div>
  );
}

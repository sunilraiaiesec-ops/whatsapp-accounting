import Link from "next/link";
import { notFound } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { can } from "@/lib/permissions";
import { accountsByType, moneyOutAccounts, fixedAssetCapableAccounts } from "@/lib/accounts";
import { getFixedAsset } from "@/lib/fixed-assets/assets";
import { listFixedAssetCategories } from "@/lib/fixed-assets/categories";
import { listParties } from "@/lib/parties";
import { isoDate } from "@/lib/format";
import { formatAmount } from "@/lib/money";
import { FixedAssetForm } from "@/components/FixedAssetForm";

export default async function EditFixedAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) notFound();

  const asset = await getFixedAsset(ctx.orgId, id);
  if (!asset || asset.status !== "ACTIVE") notFound();

  const [categories, suppliers, assetAccounts, expenseAccounts, liabilityAccounts, moneyOut] =
    await Promise.all([
      listFixedAssetCategories(ctx.orgId),
      listParties(ctx.orgId, "supplier"),
      fixedAssetCapableAccounts(ctx.orgId),
      accountsByType(ctx.orgId, "EXPENSE"),
      accountsByType(ctx.orgId, "LIABILITY"),
      moneyOutAccounts(ctx.orgId),
    ]);

  const toOption = (a: { id: string; code: string; name: string }) => ({
    id: a.id,
    label: `${a.code} — ${a.name}`,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/fixed-assets/${asset.id}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to {asset.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Edit Fixed Asset</h1>

      <FixedAssetForm
        currency={ctx.baseCurrency}
        assetId={asset.id}
        locked={asset.accumulatedDepreciation !== 0n}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          usefulLifeMonths: c.usefulLifeMonths,
          depreciationMethod: c.depreciationMethod,
          decliningBalanceRate: c.decliningBalanceRate ? Number(c.decliningBalanceRate) : null,
          fixedAssetAccountId: c.fixedAssetAccountId,
          accumulatedDeprecAccountId: c.accumulatedDeprecAccountId,
          depreciationExpenseAccountId: c.depreciationExpenseAccountId,
        }))}
        suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        assetAccounts={assetAccounts.map(toOption)}
        expenseAccounts={expenseAccounts.map(toOption)}
        sourceAccounts={[...moneyOut, ...liabilityAccounts].map(toOption)}
        defaults={{
          name: asset.name,
          categoryId: asset.categoryId ?? "",
          partyId: asset.partyId ?? "",
          purchaseDate: isoDate(asset.purchaseDate),
          placedInServiceDate: isoDate(asset.placedInServiceDate),
          purchaseCost: formatAmount(asset.purchaseCost, ctx.baseCurrency),
          salvageValue: formatAmount(asset.salvageValue, ctx.baseCurrency),
          usefulLifeMonths: String(asset.usefulLifeMonths),
          depreciationMethod: asset.depreciationMethod,
          decliningBalanceRate: asset.decliningBalanceRate
            ? String(Number(asset.decliningBalanceRate))
            : "",
          fixedAssetAccountId: asset.fixedAssetAccountId,
          accumulatedDeprecAccountId: asset.accumulatedDeprecAccountId,
          depreciationExpenseAccountId: asset.depreciationExpenseAccountId,
          sourceAccountId: asset.sourceAccountId,
          reference: asset.reference ?? "",
          notes: asset.notes ?? "",
        }}
      />
    </div>
  );
}

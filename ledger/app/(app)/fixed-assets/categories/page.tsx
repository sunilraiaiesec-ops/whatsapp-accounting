import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { can } from "@/lib/permissions";
import { accountsByType, fixedAssetCapableAccounts } from "@/lib/accounts";
import { listFixedAssetCategories } from "@/lib/fixed-assets/categories";
import { FixedAssetCategoryForm } from "@/components/FixedAssetCategoryForm";
import { ActionButton } from "@/components/ui/ActionButton";
import { createDefaultCategoriesAction } from "@/app/actions/fixed-assets";

export default async function FixedAssetCategoriesPage() {
  const ctx = await requireContext();
  const canManage = can(ctx.role, "manageFixedAssets");

  const [categories, assetAccounts, expenseAccounts] = await Promise.all([
    listFixedAssetCategories(ctx.orgId),
    fixedAssetCapableAccounts(ctx.orgId),
    accountsByType(ctx.orgId, "EXPENSE"),
  ]);

  const defaultFixedAssetAccountId =
    assetAccounts.find((a) => a.subtype === "fixed_asset")?.id ?? assetAccounts[0]?.id ?? "";
  const defaultAccumulatedDeprecAccountId =
    assetAccounts.find((a) => a.subtype === "accumulated_depreciation")?.id ??
    assetAccounts[1]?.id ??
    assetAccounts[0]?.id ??
    "";
  const defaultDepreciationExpenseAccountId =
    expenseAccounts.find((a) => a.subtype === "depreciation_expense")?.id ??
    expenseAccounts[0]?.id ??
    "";

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/fixed-assets" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to fixed assets
      </Link>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Asset Categories</h1>
          <p className="text-sm text-slate-500">
            Default accounts, useful life, and depreciation method for a class of assets.
          </p>
        </div>
        {canManage ? (
          <ActionButton
            action={createDefaultCategoriesAction}
            hiddenFields={{}}
            label="Quick add common categories"
            pendingLabel="Adding…"
            variant="outline"
          />
        ) : null}
      </div>

      <div className="mt-6 card-surface overflow-hidden">
        {categories.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--muted)]">No categories yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Method</th>
                <th className="px-4 py-2 text-right font-medium">Useful life</th>
                <th className="px-4 py-2 font-medium">Fixed asset account</th>
                <th className="px-4 py-2 font-medium">Accum. deprec. account</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {c.depreciationMethod === "STRAIGHT_LINE" ? "Straight line" : "Declining balance"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.usefulLifeMonths} mo</td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {c.fixedAssetAccount.code} — {c.fixedAssetAccount.name}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {c.accumulatedDeprecAccount.code} — {c.accumulatedDeprecAccount.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canManage ? (
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            New category
          </h2>
          <div className="mt-2">
            <FixedAssetCategoryForm
              assetAccounts={assetAccounts.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
              expenseAccounts={expenseAccounts.map((a) => ({
                id: a.id,
                label: `${a.code} — ${a.name}`,
              }))}
              defaultFixedAssetAccountId={defaultFixedAssetAccountId}
              defaultAccumulatedDeprecAccountId={defaultAccumulatedDeprecAccountId}
              defaultDepreciationExpenseAccountId={defaultDepreciationExpenseAccountId}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

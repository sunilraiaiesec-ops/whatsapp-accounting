import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { accountsByType, moneyOutAccounts, fixedAssetCapableAccounts } from "@/lib/accounts";
import { listFixedAssetCategories } from "@/lib/fixed-assets/categories";
import { listParties } from "@/lib/parties";
import { FixedAssetForm } from "@/components/FixedAssetForm";

export default async function NewFixedAssetPage() {
  const ctx = await requireContext();

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

  const sourceAccounts = [...moneyOut, ...liabilityAccounts].map(toOption);

  // Distinct sensible defaults for the two asset-side pickers — without this
  // both would default to whichever account sorts first by code (subtype is
  // the reliable signal, not list position).
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
    <div className="mx-auto max-w-3xl">
      <Link href="/fixed-assets" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to fixed assets
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New Fixed Asset</h1>
      <p className="text-sm text-slate-500">
        Capitalize a purchase — posts Dr fixed asset account / Cr the account you paid from,
        and builds the full depreciation schedule.
      </p>

      {sourceAccounts.length === 0 ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Add a bank, cash, or liability account in{" "}
          <Link href="/bank-and-cash-accounts" className="underline">
            Bank &amp; Cash Accounts
          </Link>{" "}
          first.
        </p>
      ) : (
        <FixedAssetForm
          currency={ctx.baseCurrency}
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
          sourceAccounts={sourceAccounts}
          defaultFixedAssetAccountId={defaultFixedAssetAccountId}
          defaultAccumulatedDeprecAccountId={defaultAccumulatedDeprecAccountId}
          defaultDepreciationExpenseAccountId={defaultDepreciationExpenseAccountId}
        />
      )}
    </div>
  );
}

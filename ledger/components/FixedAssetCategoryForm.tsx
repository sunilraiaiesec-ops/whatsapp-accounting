"use client";

import { useActionState, useState } from "react";

import {
  createFixedAssetCategoryAction,
  type FixedAssetState,
} from "@/app/actions/fixed-assets";

type Option = { id: string; label: string };
const initial: FixedAssetState = {};

export function FixedAssetCategoryForm({
  assetAccounts,
  expenseAccounts,
  defaultFixedAssetAccountId,
  defaultAccumulatedDeprecAccountId,
  defaultDepreciationExpenseAccountId,
}: {
  assetAccounts: Option[];
  expenseAccounts: Option[];
  defaultFixedAssetAccountId?: string;
  defaultAccumulatedDeprecAccountId?: string;
  defaultDepreciationExpenseAccountId?: string;
}) {
  const [state, action, pending] = useActionState(createFixedAssetCategoryAction, initial);
  const [depreciationMethod, setDepreciationMethod] = useState<
    "STRAIGHT_LINE" | "DECLINING_BALANCE"
  >("STRAIGHT_LINE");

  return (
    <form action={action} className="card-surface space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Category name</span>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Useful life (months)</span>
          <input
            inputMode="numeric"
            name="usefulLifeMonths"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Depreciation method</span>
          <select
            name="depreciationMethod"
            value={depreciationMethod}
            onChange={(e) =>
              setDepreciationMethod(e.target.value as "STRAIGHT_LINE" | "DECLINING_BALANCE")
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="STRAIGHT_LINE">Straight line</option>
            <option value="DECLINING_BALANCE">Declining balance</option>
          </select>
        </label>
        {depreciationMethod === "DECLINING_BALANCE" ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Rate (%/yr, optional)</span>
            <input
              inputMode="decimal"
              name="decliningBalanceRate"
              placeholder="Defaults to double-declining"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Fixed asset account</span>
          <select
            name="fixedAssetAccountId"
            defaultValue={defaultFixedAssetAccountId ?? assetAccounts[0]?.id ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {assetAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Accum. depreciation account</span>
          <select
            name="accumulatedDeprecAccountId"
            defaultValue={
              defaultAccumulatedDeprecAccountId ?? assetAccounts[1]?.id ?? assetAccounts[0]?.id ?? ""
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {assetAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Depreciation expense account</span>
          <select
            name="depreciationExpenseAccountId"
            defaultValue={defaultDepreciationExpenseAccountId ?? expenseAccounts[0]?.id ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between">
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : <span />}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Add category"}
        </button>
      </div>
    </form>
  );
}

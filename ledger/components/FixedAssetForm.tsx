"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createFixedAssetAction,
  updateFixedAssetAction,
  type FixedAssetState,
} from "@/app/actions/fixed-assets";
import { AccountingPreview } from "@/components/ui/AccountingPreview";
import { parseAmount } from "@/lib/money";

type Option = { id: string; label: string };
type CategoryOption = {
  id: string;
  name: string;
  usefulLifeMonths: number;
  depreciationMethod: "STRAIGHT_LINE" | "DECLINING_BALANCE";
  decliningBalanceRate: number | null;
  fixedAssetAccountId: string;
  accumulatedDeprecAccountId: string;
  depreciationExpenseAccountId: string;
};

type Defaults = {
  name: string;
  categoryId: string;
  partyId: string;
  purchaseDate: string;
  placedInServiceDate: string;
  purchaseCost: string;
  salvageValue: string;
  usefulLifeMonths: string;
  depreciationMethod: "STRAIGHT_LINE" | "DECLINING_BALANCE";
  decliningBalanceRate: string;
  fixedAssetAccountId: string;
  accumulatedDeprecAccountId: string;
  depreciationExpenseAccountId: string;
  sourceAccountId: string;
  reference: string;
  notes: string;
};

const initial: FixedAssetState = {};

export function FixedAssetForm({
  currency,
  categories,
  suppliers,
  assetAccounts,
  expenseAccounts,
  sourceAccounts,
  assetId,
  defaults,
  locked = false,
  defaultFixedAssetAccountId,
  defaultAccumulatedDeprecAccountId,
  defaultDepreciationExpenseAccountId,
}: {
  currency: string;
  categories: CategoryOption[];
  suppliers: Option[];
  assetAccounts: Option[];
  expenseAccounts: Option[];
  sourceAccounts: Option[];
  assetId?: string;
  defaults?: Defaults;
  locked?: boolean;
  // Distinct sensible defaults for the account pickers below — without these
  // they'd fall back to whichever account sorts first by code (e.g. Cost of
  // Goods Sold for the expense picker), not the semantically-correct one.
  defaultFixedAssetAccountId?: string;
  defaultAccumulatedDeprecAccountId?: string;
  defaultDepreciationExpenseAccountId?: string;
}) {
  const [state, action, pending] = useActionState(
    assetId ? updateFixedAssetAction : createFixedAssetAction,
    initial,
  );

  const today = new Date().toISOString().slice(0, 10);
  const [categoryId, setCategoryId] = useState(defaults?.categoryId ?? "");
  const [name, setName] = useState(defaults?.name ?? "");
  const [purchaseCost, setPurchaseCost] = useState(defaults?.purchaseCost ?? "");
  const [salvageValue, setSalvageValue] = useState(defaults?.salvageValue ?? "0");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(defaults?.usefulLifeMonths ?? "");
  const [depreciationMethod, setDepreciationMethod] = useState<
    "STRAIGHT_LINE" | "DECLINING_BALANCE"
  >(defaults?.depreciationMethod ?? "STRAIGHT_LINE");
  const [decliningBalanceRate, setDecliningBalanceRate] = useState(
    defaults?.decliningBalanceRate ?? "",
  );
  const [fixedAssetAccountId, setFixedAssetAccountId] = useState(
    defaults?.fixedAssetAccountId ?? defaultFixedAssetAccountId ?? assetAccounts[0]?.id ?? "",
  );
  const [accumulatedDeprecAccountId, setAccumulatedDeprecAccountId] = useState(
    defaults?.accumulatedDeprecAccountId ??
      defaultAccumulatedDeprecAccountId ??
      assetAccounts[1]?.id ??
      assetAccounts[0]?.id ??
      "",
  );
  const [depreciationExpenseAccountId, setDepreciationExpenseAccountId] = useState(
    defaults?.depreciationExpenseAccountId ??
      defaultDepreciationExpenseAccountId ??
      expenseAccounts[0]?.id ??
      "",
  );
  const [sourceAccountId, setSourceAccountId] = useState(
    defaults?.sourceAccountId ?? sourceAccounts[0]?.id ?? "",
  );

  function applyCategory(id: string) {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    setUsefulLifeMonths(String(cat.usefulLifeMonths));
    setDepreciationMethod(cat.depreciationMethod);
    setDecliningBalanceRate(cat.decliningBalanceRate != null ? String(cat.decliningBalanceRate) : "");
    setFixedAssetAccountId(cat.fixedAssetAccountId);
    setAccumulatedDeprecAccountId(cat.accumulatedDeprecAccountId);
    setDepreciationExpenseAccountId(cat.depreciationExpenseAccountId);
  }

  const previewLines = useMemo(() => {
    const cost = parseAmount(purchaseCost || "0", currency);
    const assetLabel =
      assetAccounts.find((a) => a.id === fixedAssetAccountId)?.label ?? "Fixed asset account";
    const sourceLabel =
      sourceAccounts.find((a) => a.id === sourceAccountId)?.label ?? "Source account";
    return [
      { label: assetLabel, debit: cost },
      { label: sourceLabel, credit: cost },
    ];
  }, [purchaseCost, currency, fixedAssetAccountId, sourceAccountId, assetAccounts, sourceAccounts]);

  return (
    <form action={action} className="mt-6 space-y-5">
      {assetId && <input type="hidden" name="id" value={assetId} />}

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Asset name</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Category (optional)</span>
          <select
            name="categoryId"
            value={categoryId}
            onChange={(e) => applyCategory(e.target.value)}
            disabled={locked}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Supplier (optional)</span>
          <select
            name="partyId"
            defaultValue={defaults?.partyId ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Purchase date</span>
          <input
            type="date"
            name="purchaseDate"
            defaultValue={defaults?.purchaseDate ?? today}
            disabled={locked}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Placed in service</span>
          <input
            type="date"
            name="placedInServiceDate"
            defaultValue={defaults?.placedInServiceDate ?? today}
            disabled={locked}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Purchase cost</span>
          <input
            inputMode="decimal"
            name="purchaseCost"
            value={purchaseCost}
            onChange={(e) => setPurchaseCost(e.target.value)}
            disabled={locked}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm disabled:bg-slate-50"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Salvage value</span>
          <input
            inputMode="decimal"
            name="salvageValue"
            value={salvageValue}
            onChange={(e) => setSalvageValue(e.target.value)}
            disabled={locked}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm disabled:bg-slate-50"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Useful life (months)</span>
          <input
            inputMode="numeric"
            name="usefulLifeMonths"
            value={usefulLifeMonths}
            onChange={(e) => setUsefulLifeMonths(e.target.value)}
            disabled={locked}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm disabled:bg-slate-50"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Depreciation method</span>
          <select
            name="depreciationMethod"
            value={depreciationMethod}
            onChange={(e) =>
              setDepreciationMethod(e.target.value as "STRAIGHT_LINE" | "DECLINING_BALANCE")
            }
            disabled={locked}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            <option value="STRAIGHT_LINE">Straight line</option>
            <option value="DECLINING_BALANCE">Declining balance</option>
          </select>
        </label>
      </div>

      {depreciationMethod === "DECLINING_BALANCE" ? (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Declining balance rate (% per year, optional)
          </span>
          <input
            inputMode="decimal"
            name="decliningBalanceRate"
            value={decliningBalanceRate}
            onChange={(e) => setDecliningBalanceRate(e.target.value)}
            disabled={locked}
            placeholder="Defaults to double-declining (200 / useful life in years)"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Fixed asset account</span>
          <select
            name="fixedAssetAccountId"
            value={fixedAssetAccountId}
            onChange={(e) => setFixedAssetAccountId(e.target.value)}
            disabled={locked}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            {assetAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Accumulated depreciation account</span>
          <select
            name="accumulatedDeprecAccountId"
            value={accumulatedDeprecAccountId}
            onChange={(e) => setAccumulatedDeprecAccountId(e.target.value)}
            disabled={locked}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            {assetAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Depreciation expense account</span>
          <select
            name="depreciationExpenseAccountId"
            value={depreciationExpenseAccountId}
            onChange={(e) => setDepreciationExpenseAccountId(e.target.value)}
            disabled={locked}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Paid from</span>
          <select
            name="sourceAccountId"
            value={sourceAccountId}
            onChange={(e) => setSourceAccountId(e.target.value)}
            disabled={locked}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            {sourceAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Reference / invoice number (optional)</span>
          <input
            name="reference"
            defaultValue={defaults?.reference ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes (optional)</span>
          <input
            name="notes"
            defaultValue={defaults?.notes ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {locked ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          Depreciation has already posted for this asset, so cost, dates, useful life, method, and
          accounts are locked. Only the name, category, supplier, reference, and notes can be
          changed.
        </p>
      ) : null}

      <AccountingPreview lines={previewLines} currency={currency} />

      <div className="flex items-center justify-between">
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : <span />}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Saving…" : assetId ? "Save changes" : "Add asset"}
        </button>
      </div>
    </form>
  );
}

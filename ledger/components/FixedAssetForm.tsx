"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createFixedAssetAction,
  updateFixedAssetAction,
  type FixedAssetState,
} from "@/app/actions/fixed-assets";
import { searchBantooEntities } from "@/app/actions/bantoo";
import { BantooCombobox } from "@/components/BantooCombobox";
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
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

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

  const [partyId, setPartyId] = useState(defaults?.partyId ?? "");
  const [partyName, setPartyName] = useState(
    () => suppliers.find((s) => s.id === defaults?.partyId)?.label ?? "",
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
    <form action={action} className="space-y-6">
      {assetId && <input type="hidden" name="id" value={assetId} />}

      <div className="card-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Asset details
        </h2>
        <label className="block">
          <span className={labelClass}>Asset name</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input-modern"
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Category (optional)</span>
            <select
              name="categoryId"
              value={categoryId}
              onChange={(e) => applyCategory(e.target.value)}
              disabled={locked}
              className="input-modern disabled:bg-slate-50"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <BantooCombobox
            label="Supplier (optional)"
            text={partyName}
            selectedId={partyId || null}
            options={suppliers}
            onSearch={(q) => searchBantooEntities("supplier", q).then((r) => r.candidates)}
            placeholder="Search or type a new supplier…"
            createLabel={(name) => `Create new supplier "${name}"`}
            onSelectExisting={(opt) => {
              setPartyId(opt.id);
              setPartyName(opt.label);
            }}
            onTextChange={(v) => {
              setPartyName(v);
              setPartyId("");
            }}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Purchase date</span>
            <input
              type="date"
              name="purchaseDate"
              defaultValue={defaults?.purchaseDate ?? today}
              disabled={locked}
              className="input-modern disabled:bg-slate-50"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Placed in service</span>
            <input
              type="date"
              name="placedInServiceDate"
              defaultValue={defaults?.placedInServiceDate ?? today}
              disabled={locked}
              className="input-modern disabled:bg-slate-50"
            />
          </label>
        </div>
      </div>

      <div className="card-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Cost & depreciation
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Purchase cost</span>
            <input
              inputMode="decimal"
              name="purchaseCost"
              value={purchaseCost}
              onChange={(e) => setPurchaseCost(e.target.value)}
              disabled={locked}
              required
              className="input-modern text-right tabular-nums disabled:bg-slate-50"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Salvage value</span>
            <input
              inputMode="decimal"
              name="salvageValue"
              value={salvageValue}
              onChange={(e) => setSalvageValue(e.target.value)}
              disabled={locked}
              className="input-modern text-right tabular-nums disabled:bg-slate-50"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Useful life (months)</span>
            <input
              inputMode="numeric"
              name="usefulLifeMonths"
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
              disabled={locked}
              required
              className="input-modern text-right tabular-nums disabled:bg-slate-50"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Depreciation method</span>
            <select
              name="depreciationMethod"
              value={depreciationMethod}
              onChange={(e) =>
                setDepreciationMethod(e.target.value as "STRAIGHT_LINE" | "DECLINING_BALANCE")
              }
              disabled={locked}
              className="input-modern disabled:bg-slate-50"
            >
              <option value="STRAIGHT_LINE">Straight line</option>
              <option value="DECLINING_BALANCE">Declining balance</option>
            </select>
          </label>
        </div>

        {depreciationMethod === "DECLINING_BALANCE" ? (
          <label className="mt-4 block">
            <span className={labelClass}>
              Declining balance rate (% per year, optional)
            </span>
            <input
              inputMode="decimal"
              name="decliningBalanceRate"
              value={decliningBalanceRate}
              onChange={(e) => setDecliningBalanceRate(e.target.value)}
              disabled={locked}
              placeholder="Defaults to double-declining (200 / useful life in years)"
              className="input-modern disabled:bg-slate-50"
            />
          </label>
        ) : null}
      </div>

      <div className="card-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Accounts
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Fixed asset account</span>
            <select
              name="fixedAssetAccountId"
              value={fixedAssetAccountId}
              onChange={(e) => setFixedAssetAccountId(e.target.value)}
              disabled={locked}
              className="input-modern disabled:bg-slate-50"
            >
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Accumulated depreciation account</span>
            <select
              name="accumulatedDeprecAccountId"
              value={accumulatedDeprecAccountId}
              onChange={(e) => setAccumulatedDeprecAccountId(e.target.value)}
              disabled={locked}
              className="input-modern disabled:bg-slate-50"
            >
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Depreciation expense account</span>
            <select
              name="depreciationExpenseAccountId"
              value={depreciationExpenseAccountId}
              onChange={(e) => setDepreciationExpenseAccountId(e.target.value)}
              disabled={locked}
              className="input-modern disabled:bg-slate-50"
            >
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Paid from</span>
            <select
              name="sourceAccountId"
              value={sourceAccountId}
              onChange={(e) => setSourceAccountId(e.target.value)}
              disabled={locked}
              className="input-modern disabled:bg-slate-50"
            >
              {sourceAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card-surface p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Reference / invoice number (optional)</span>
            <input
              name="reference"
              defaultValue={defaults?.reference ?? ""}
              className="input-modern"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Notes (optional)</span>
            <input
              name="notes"
              defaultValue={defaults?.notes ?? ""}
              className="input-modern"
            />
          </label>
        </div>

        {locked ? (
          <p className="mt-4 rounded-xl border border-[var(--border)] bg-slate-50 p-3 text-xs text-slate-500">
            Depreciation has already posted for this asset, so cost, dates, useful life, method, and
            accounts are locked. Only the name, category, supplier, reference, and notes can be
            changed.
          </p>
        ) : null}
      </div>

      <input type="hidden" name="partyId" value={partyId} />
      <input type="hidden" name="partyName" value={partyId ? "" : partyName} />

      <AccountingPreview lines={previewLines} currency={currency} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {state.error ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{state.error}</p>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : assetId ? "Save changes" : "Add asset"}
        </button>
      </div>
    </form>
  );
}

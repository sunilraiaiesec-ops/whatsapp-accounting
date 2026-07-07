"use client";

import { useState } from "react";

import type { ClientWizardState } from "@/lib/migration/types";
import { ASSET_CATEGORIES, LIABILITY_CATEGORIES, EQUITY_CATEGORIES } from "@/lib/migration/categories";
import { MoneyInput } from "@/components/migration/MoneyInput";
import { addBankAccountAction, saveBankBalanceAction, saveOpeningBalanceAction } from "@/app/actions/migration";

function sumStrings(values: string[]): number {
  return values.reduce((s, v) => s + (Number(v.replace(/,/g, "")) || 0), 0);
}

function GroupSection({
  title,
  state,
  onStateChange,
  onGoToStep4,
}: {
  title: string;
  state: ClientWizardState;
  onStateChange: (s: ClientWizardState) => void;
  onGoToStep4: () => void;
}) {
  const categories =
    title === "Assets" ? ASSET_CATEGORIES : title === "Liabilities" ? LIABILITY_CATEGORIES : EQUITY_CATEGORIES;

  return (
    <section className="card-surface p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-3 space-y-4">
        {categories.map((cat) => {
          if (cat.kind === "bank") {
            return (
              <BankCategoryRows key={cat.key} state={state} onStateChange={onStateChange} />
            );
          }
          if (cat.kind === "subledger") {
            const total =
              cat.subledger === "customer"
                ? sumStrings(state.customerBalances.map((r) => r.amount))
                : cat.subledger === "supplier"
                  ? sumStrings(state.supplierBalances.map((r) => r.amount))
                  : sumStrings(state.inventoryBalances.map((r) => r.totalValue));
            return (
              <div key={cat.key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">{cat.label}</p>
                  <p className="text-xs text-[var(--muted)]">Assigned per {cat.subledger} in Step 4</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-sm font-semibold text-slate-900">
                    {total.toLocaleString()} {state.currency}
                  </span>
                  <button type="button" onClick={onGoToStep4} className="text-xs font-medium text-[var(--brand)] hover:underline">
                    Assign →
                  </button>
                </div>
              </div>
            );
          }
          const accounts = state.accounts.filter((a) => a.subtype === cat.subtype);
          return accounts.map((acc) => {
            const row = state.openingBalances.find((r) => r.accountId === acc.id);
            return (
              <div key={acc.id} className="grid grid-cols-[1fr_180px] items-center gap-3">
                <label className="text-sm text-slate-700">
                  {cat.label}
                  {accounts.length > 1 ? <span className="text-[var(--muted)]"> — {acc.name}</span> : null}
                </label>
                <MoneyInput
                  initialValue={row?.amount ?? "0"}
                  onCommit={async (v) => {
                    const res = await saveOpeningBalanceAction(acc.id, v);
                    if (res.state) onStateChange(res.state);
                  }}
                />
              </div>
            );
          });
        })}
      </div>
    </section>
  );
}

export function BankCategoryRows({
  state,
  onStateChange,
}: {
  state: ClientWizardState;
  onStateChange: (s: ClientWizardState) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [subtype, setSubtype] = useState<"bank" | "cash">("bank");
  const [pending, setPending] = useState(false);
  const bankAccounts = state.accounts.filter((a) => a.subtype === "bank" || a.subtype === "cash");

  async function submitAdd() {
    if (!name.trim()) return;
    setPending(true);
    const res = await addBankAccountAction(name.trim(), subtype, state.currency);
    setPending(false);
    if (res.state) onStateChange(res.state);
    setName("");
    setAdding(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-800">Cash & Bank Accounts</p>
        <button type="button" onClick={() => setAdding((v) => !v)} className="text-xs font-medium text-[var(--brand)] hover:underline">
          {adding ? "Cancel" : "+ Add account"}
        </button>
      </div>
      {adding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <input
            className="input-modern w-48"
            placeholder="Account name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select className="input-modern w-32" value={subtype} onChange={(e) => setSubtype(e.target.value as "bank" | "cash")}>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
          <button type="button" disabled={pending} onClick={submitAdd} className="btn-brand disabled:opacity-50">
            Add
          </button>
        </div>
      ) : null}
      {bankAccounts.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No bank or cash accounts yet — add one above.</p>
      ) : (
        bankAccounts.map((acc) => {
          const row = state.bankBalances.find((r) => r.accountId === acc.id);
          return (
            <div key={acc.id} className="grid grid-cols-[1fr_180px] items-center gap-3">
              <label className="text-sm text-slate-700">{acc.name}</label>
              <MoneyInput
                initialValue={row?.amount ?? "0"}
                onCommit={async (v) => {
                  const res = await saveBankBalanceAction(acc.id, v);
                  if (res.state) onStateChange(res.state);
                }}
              />
            </div>
          );
        })
      )}
    </div>
  );
}

export function StepOpeningBalances({
  state,
  onStateChange,
  onGoToStep4,
}: {
  state: ClientWizardState;
  onStateChange: (s: ClientWizardState) => void;
  onGoToStep4: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold text-slate-900">Step 3 · Opening Balances</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Enter a balance for each Balance Sheet account as of your migration date. Nothing here
          posts to your ledger yet — it&apos;s staged until you Finish in Step 7.
        </p>
      </div>
      <GroupSection title="Assets" state={state} onStateChange={onStateChange} onGoToStep4={onGoToStep4} />
      <GroupSection title="Liabilities" state={state} onStateChange={onStateChange} onGoToStep4={onGoToStep4} />
      <GroupSection title="Equity" state={state} onStateChange={onStateChange} onGoToStep4={onGoToStep4} />
    </div>
  );
}

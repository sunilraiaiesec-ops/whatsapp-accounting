"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ClientWizardState } from "@/lib/migration/types";
import { rerunMigrationWizardAction } from "@/app/actions/migration";

function fmt(amount: string, currency: string): string {
  return `${amount} ${currency}`;
}

// Shown instead of the step flow once `status === "completed"`. Anyone with
// access to /migration can view this (read-only recap of what was posted);
// only an administrator sees an enabled "Rerun" button — reopening to VIEW
// is always allowed, only re-running/re-finishing is admin-gated.
export function MigrationCompletedSummary({ initialState }: { initialState: ClientWizardState }) {
  const router = useRouter();
  const [state] = useState(initialState);
  const [confirming, setConfirming] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openingBalanceTotal = state.openingBalances.reduce((s, r) => s + Number(r.amount || "0"), 0);
  const bankTotal = state.bankBalances.reduce((s, r) => s + Number(r.amount || "0"), 0);
  const arTotal = state.customerBalances.reduce((s, r) => s + Number(r.amount || "0"), 0);
  const apTotal = state.supplierBalances.reduce((s, r) => s + Number(r.amount || "0"), 0);
  const invTotal = state.inventoryBalances.reduce((s, r) => s + Number(r.totalValue || "0"), 0);

  async function handleRerun() {
    setRerunning(true);
    setError(null);
    const res = await rerunMigrationWizardAction();
    setRerunning(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="card-surface p-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✓</span>
          <h2 className="text-lg font-semibold text-slate-900">Migration completed</h2>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Opening balances as of <span className="font-medium text-slate-700">{state.wizard.openingDate}</span>{" "}
          were posted to your ledger
          {state.wizard.completedAt ? ` on ${new Date(state.wizard.completedAt).toLocaleString()}` : ""}.
        </p>
      </div>

      <div className="card-surface grid gap-4 p-6 sm:grid-cols-3">
        <SummaryStat label="Cash & Bank" value={fmt(bankTotal.toLocaleString(), state.currency)} />
        <SummaryStat label="Accounts Receivable" value={fmt(arTotal.toLocaleString(), state.currency)} />
        <SummaryStat label="Accounts Payable" value={fmt(apTotal.toLocaleString(), state.currency)} />
        <SummaryStat label="Inventory" value={fmt(invTotal.toLocaleString(), state.currency)} />
        <SummaryStat
          label="Other balance-sheet accounts"
          value={fmt(openingBalanceTotal.toLocaleString(), state.currency)}
        />
        <SummaryStat label="Customers / Suppliers assigned" value={`${state.customerBalances.length} / ${state.supplierBalances.length}`} />
      </div>

      <div className="card-surface p-6">
        <h3 className="text-sm font-semibold text-slate-900">Rerun this migration</h3>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Rerunning clears all staged wizard data and takes you back to Step 1 so you can redo the
          migration — for example to fix a mistake. It does <span className="font-medium">not</span>{" "}
          reverse the journal entry that was already posted; if that entry is wrong, post a normal
          correcting/adjusting entry the same way you would for any other document.
        </p>
        {!state.isAdmin ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Only an administrator (Owner or Admin) can rerun a completed migration.
          </p>
        ) : !confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="pill-action mt-3">
            Rerun migration…
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium text-red-700">
              Are you sure? This clears all staged wizard data (the already-posted journal entry is
              untouched).
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={rerunning} onClick={handleRerun} className="btn-brand disabled:opacity-50">
                {rerunning ? "Resetting…" : "Yes, rerun from Step 1"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="pill-action">
                Cancel
              </button>
            </div>
          </div>
        )}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import type { ClientWizardState } from "@/lib/migration/types";
import { getValidationSnapshotAction, type ValidationSnapshot } from "@/app/actions/migration";

export function StepPreview({ state }: { state: ClientWizardState }) {
  const [snapshot, setSnapshot] = useState<ValidationSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    getValidationSnapshotAction().then((r) => {
      if (!cancelled && "snapshot" in r) setSnapshot(r.snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (!snapshot) return <div className="card-surface p-6 text-sm text-[var(--muted)]">Building preview…</div>;

  const { preview } = snapshot;

  return (
    <div className="space-y-5">
      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold text-slate-900">Step 6 · Preview</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          This is a dry run — nothing below has been posted yet. It shows exactly what Finish (Step
          7) will create.
        </p>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Opening Balances journal entry</h3>
          <p className="text-xs text-[var(--muted)]">
            {preview.entryLines.length} line(s) · Debits {preview.totalDebit.toString()} = Credits{" "}
            {preview.totalCredit.toString()} {state.currency}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Account</th>
              <th className="px-4 py-2">Party</th>
              <th className="px-4 py-2 text-right">Debit</th>
              <th className="px-4 py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {preview.entryLines.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-[var(--muted)]">
                  Nothing staged yet.
                </td>
              </tr>
            ) : (
              preview.entryLines.map((l, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    {l.accountCode} · {l.accountLabel}
                  </td>
                  <td className="px-4 py-2 text-[var(--muted)]">{l.partyLabel ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{l.debit !== 0n ? l.debit.toString() : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{l.credit !== 0n ? l.credit.toString() : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Inventory quantity/value updates</h3>
          <p className="text-xs text-[var(--muted)]">{preview.inventoryLines.length} item(s)</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2 text-right">Quantity</th>
              <th className="px-4 py-2 text-right">Unit cost</th>
              <th className="px-4 py-2 text-right">Total value</th>
              <th className="px-4 py-2">Warehouse</th>
            </tr>
          </thead>
          <tbody>
            {preview.inventoryLines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-[var(--muted)]">
                  No inventory staged.
                </td>
              </tr>
            ) : (
              preview.inventoryLines.map((l) => (
                <tr key={l.itemId} className="border-t border-slate-100">
                  <td className="px-4 py-2">{l.itemLabel}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{l.unitCost.toString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{l.totalValue.toString()}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">{l.warehouse ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!preview.balanced ? (
        <p className="text-sm font-medium text-amber-800">
          This preview isn&apos;t balanced yet — go back to Step 5 before finishing.
        </p>
      ) : (
        <p className="text-sm font-medium text-emerald-700">✓ This entry balances and is ready to finish.</p>
      )}
    </div>
  );
}

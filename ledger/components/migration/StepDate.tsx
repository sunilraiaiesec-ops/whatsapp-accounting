"use client";

import { useState } from "react";

import type { ClientWizardState } from "@/lib/migration/types";
import { setOpeningDateAction } from "@/app/actions/migration";

export function StepDate({
  state,
  onStateChange,
}: {
  state: ClientWizardState;
  onStateChange: (s: ClientWizardState) => void;
}) {
  const [date, setDate] = useState(state.wizard.openingDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(value: string) {
    if (!value) return;
    setSaving(true);
    setError(null);
    const result = await setOpeningDateAction(value);
    setSaving(false);
    if ("error" in result && result.error) setError(result.error);
    if (result.state) onStateChange(result.state);
  }

  return (
    <div className="card-surface p-6">
      <h2 className="text-lg font-semibold text-slate-900">Step 1 · Migration Date</h2>
      <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
        BantooBooks will begin recording transactions from this date. Transactions before this date
        remain in your previous accounting system — you&apos;re only entering balances{" "}
        <span className="font-medium text-slate-700">as of</span> this date, not re-entering every
        historical transaction.
      </p>

      <div className="mt-5 max-w-xs">
        <label className="text-sm font-medium text-slate-700" htmlFor="migration-date">
          Opening / migration date
        </label>
        <input
          id="migration-date"
          type="date"
          className="input-modern mt-1"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
        />
        {saving ? <p className="mt-1 text-xs text-[var(--muted)]">Saving…</p> : null}
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        {!date ? (
          <p className="mt-1 text-xs text-amber-700">Set a date to continue to Step 2.</p>
        ) : (
          <p className="mt-1 text-xs text-[var(--brand)]">✓ Saved</p>
        )}
      </div>
    </div>
  );
}

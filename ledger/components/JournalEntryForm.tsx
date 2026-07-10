"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createJournalEntryAction,
  type JournalState,
} from "@/app/actions/journal";
import { parseAmount, formatAmount } from "@/lib/money";

export type AccountOption = {
  id: string;
  code: string;
  name: string;
  isControl: boolean;
};

type Row = { accountId: string; debit: string; credit: string };

const emptyRow = (): Row => ({ accountId: "", debit: "", credit: "" });
const initial: JournalState = {};
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function JournalEntryForm({
  accounts,
  currency,
}: {
  accounts: AccountOption[];
  currency: string;
}) {
  const [state, action, pending] = useActionState(
    createJournalEntryAction,
    initial,
  );
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);

  const totals = useMemo(() => {
    let debit = 0n;
    let credit = 0n;
    for (const r of rows) {
      if (r.debit) debit += parseAmount(r.debit, currency);
      if (r.credit) credit += parseAmount(r.credit, currency);
    }
    return { debit, credit, balanced: debit === credit && debit > 0n };
  }, [rows, currency]);

  const linesPayload = useMemo(
    () =>
      rows
        .filter((r) => r.accountId && (r.debit || r.credit))
        .map((r) => ({
          accountId: r.accountId,
          side: r.debit ? "debit" : "credit",
          amount: r.debit || r.credit,
        })),
    [rows],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="space-y-6">
      <div className="card-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Entry details
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={labelClass}>Date</span>
            <input
              type="date"
              name="entryDate"
              defaultValue={today}
              className="input-modern"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelClass}>Description</span>
            <input
              name="description"
              placeholder="e.g. Owner capital contribution"
              className="input-modern"
            />
          </label>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Lines
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <th className="px-4 py-3">Account</th>
                <th className="w-40 px-4 py-3 text-right">Debit</th>
                <th className="w-40 px-4 py-3 text-right">Credit</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <select
                      value={row.accountId}
                      onChange={(e) => update(i, { accountId: e.target.value })}
                      className="input-modern py-2"
                    >
                      <option value="">Select account…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id} disabled={a.isControl}>
                          {a.code} — {a.name}
                          {a.isControl ? " (control)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      inputMode="decimal"
                      value={row.debit}
                      onChange={(e) =>
                        update(i, { debit: e.target.value, credit: "" })
                      }
                      className="input-modern py-2 text-right tabular-nums"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      inputMode="decimal"
                      value={row.credit}
                      onChange={(e) =>
                        update(i, { credit: e.target.value, debit: "" })
                      }
                      className="input-modern py-2 text-right tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {rows.length > 2 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRows((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove line"
                      >
                        ×
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-slate-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="text-sm font-semibold text-[var(--brand)] hover:underline"
          >
            + Add line
          </button>
          <div className="flex gap-6 text-right text-sm">
            <div>
              <span className="text-[var(--muted)]">Debit</span>
              <p className="tabular-nums font-semibold text-slate-900">
                {formatAmount(totals.debit, currency)}
              </p>
            </div>
            <div>
              <span className="text-[var(--muted)]">Credit</span>
              <p className="tabular-nums font-semibold text-slate-900">
                {formatAmount(totals.credit, currency)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {state.error ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{state.error}</p>
        ) : (
          <span
            className={`text-sm ${
              totals.balanced ? "text-emerald-600" : "text-[var(--muted)]"
            }`}
          >
            {totals.balanced
              ? "Balanced ✓"
              : `Difference: ${formatAmount(
                  totals.debit - totals.credit,
                  currency,
                )} ${currency}`}
          </span>
        )}
        <button
          type="submit"
          disabled={pending || !totals.balanced}
          className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Posting…" : "Post entry"}
        </button>
      </div>
    </form>
  );
}

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
    <form action={action} className="mt-6 space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Date</span>
          <input
            type="date"
            name="entryDate"
            defaultValue={today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Description</span>
          <input
            name="description"
            placeholder="e.g. Owner capital contribution"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="w-40 px-3 py-2 text-right font-medium">Debit</th>
              <th className="w-40 px-3 py-2 text-right font-medium">Credit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <select
                    value={row.accountId}
                    onChange={(e) => update(i, { accountId: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
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
                <td className="px-3 py-2">
                  <input
                    inputMode="decimal"
                    value={row.debit}
                    onChange={(e) =>
                      update(i, { debit: e.target.value, credit: "" })
                    }
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    inputMode="decimal"
                    value={row.credit}
                    onChange={(e) =>
                      update(i, { credit: e.target.value, debit: "" })
                    }
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  {rows.length > 2 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      ×
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-medium">
              <td className="px-3 py-2 text-slate-600">
                <button
                  type="button"
                  onClick={() => setRows((prev) => [...prev, emptyRow()])}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  + Add line
                </button>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatAmount(totals.debit, currency)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatAmount(totals.credit, currency)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

      <div className="flex items-center justify-between">
        <span
          className={`text-sm ${
            totals.balanced ? "text-emerald-600" : "text-slate-500"
          }`}
        >
          {totals.balanced
            ? "Balanced ✓"
            : `Difference: ${formatAmount(
                totals.debit - totals.credit,
                currency,
              )} ${currency}`}
        </span>
        <button
          type="submit"
          disabled={pending || !totals.balanced}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Posting…" : "Post entry"}
        </button>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

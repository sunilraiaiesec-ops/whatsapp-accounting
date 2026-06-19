"use client";

import { useActionState, useMemo, useState } from "react";

import type { DocState } from "@/app/actions/documents";
import { parseAmount, formatAmount } from "@/lib/money";

type Option = { id: string; label: string };
type Row = { accountId: string; amount: string };

const initial: DocState = {};
const emptyRow = (): Row => ({ accountId: "", amount: "" });

type CashDefaults = {
  date: string;
  bankAccountId: string;
  partyId: string;
  reference: string;
  description: string;
  lines: Row[];
};

export function CashDocForm({
  mode,
  action,
  bankAccounts,
  parties,
  accounts,
  currency,
  documentId,
  defaults,
}: {
  mode: "receipt" | "payment";
  action: (prev: DocState, fd: FormData) => Promise<DocState>;
  bankAccounts: Option[];
  parties: Option[];
  accounts: Option[];
  currency: string;
  documentId?: string;
  defaults?: CashDefaults;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<Row[]>(
    defaults?.lines?.length ? defaults.lines : [emptyRow()],
  );

  const total = useMemo(
    () =>
      rows.reduce(
        (s, r) => (r.amount ? s + parseAmount(r.amount, currency) : s),
        0n,
      ),
    [rows, currency],
  );

  const linesPayload = useMemo(
    () => rows.filter((r) => r.accountId && r.amount),
    [rows],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const isReceipt = mode === "receipt";

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {documentId ? <input type="hidden" name="id" value={documentId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Date</span>
          <input
            type="date"
            name="date"
            defaultValue={defaults?.date ?? today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            {isReceipt ? "Received into" : "Paid from"}
          </span>
          <select
            name="bankAccountId"
            defaultValue={defaults?.bankAccountId ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select account…</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            {isReceipt ? "Received from" : "Paid to"} (optional)
          </span>
          <select
            name="partyId"
            defaultValue={defaults?.partyId ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Reference (optional)
          </span>
          <input
            name="reference"
            defaultValue={defaults?.reference ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Description (optional)
        </span>
        <input
          name="description"
          defaultValue={defaults?.description ?? ""}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">
                {isReceipt ? "Credit account (income / receivable)" : "Debit account (expense / payable)"}
              </th>
              <th className="w-44 px-3 py-2 text-right font-medium">Amount</th>
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
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => update(i, { amount: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  {rows.length > 1 ? (
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
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => setRows((prev) => [...prev, emptyRow()])}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  + Add line
                </button>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatAmount(total, currency)} {currency}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

      <div className="flex items-center justify-between">
        {state.error ? (
          <span className="text-sm text-red-600">{state.error}</span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending || total <= 0n}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Saving…" : documentId ? "Save changes" : isReceipt ? "Save receipt" : "Save payment"}
        </button>
      </div>
    </form>
  );
}

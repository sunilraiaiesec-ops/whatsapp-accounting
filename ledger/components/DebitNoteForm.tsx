"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createDebitNoteAction,
  type DocState,
} from "@/app/actions/documents";
import { parseAmount, formatAmount } from "@/lib/money";

type Option = { id: string; label: string };
type Row = {
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string;
};

const initial: DocState = {};
const emptyRow = (): Row => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  accountId: "",
});

export function DebitNoteForm({
  suppliers,
  expenseAccounts,
  currency,
}: {
  suppliers: Option[];
  expenseAccounts: Option[];
  currency: string;
}) {
  const [state, action, pending] = useActionState(createDebitNoteAction, initial);
  const today = new Date().toISOString().slice(0, 10);
  const defaultAccount = expenseAccounts[0]?.id ?? "";
  const [rows, setRows] = useState<Row[]>([
    { ...emptyRow(), accountId: defaultAccount },
  ]);

  const lineTotal = (r: Row): bigint => {
    const qty = Number(r.quantity || "0");
    const price = parseAmount(r.unitPrice || "0", currency);
    if (!Number.isFinite(qty)) return 0n;
    return BigInt(Math.round(qty * Number(price)));
  };

  const total = useMemo(
    () => rows.reduce((s, r) => s + lineTotal(r), 0n),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, currency],
  );

  const linesPayload = useMemo(
    () =>
      rows
        .filter((r) => r.description.trim() && r.accountId)
        .map((r) => ({
          description: r.description,
          quantity: r.quantity || "1",
          unitPrice: r.unitPrice || "0",
          accountId: r.accountId,
        })),
    [rows],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="mt-6 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Supplier</span>
          <select
            name="partyId"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select supplier…</option>
            {suppliers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Supplier&apos;s reference (optional)
          </span>
          <input
            name="supplierRef"
            placeholder="Original bill number"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Date</span>
          <input
            type="date"
            name="date"
            defaultValue={today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="w-20 px-3 py-2 text-right font-medium">Qty</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Unit price</th>
              <th className="px-3 py-2 font-medium">Expense / asset account</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <input
                    value={row.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(e) => update(i, { quantity: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    inputMode="decimal"
                    value={row.unitPrice}
                    onChange={(e) => update(i, { unitPrice: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.accountId}
                    onChange={(e) => update(i, { accountId: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Select…</option>
                    {expenseAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatAmount(lineTotal(row), currency)}
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
              <td className="px-3 py-2" colSpan={4}>
                <button
                  type="button"
                  onClick={() =>
                    setRows((prev) => [
                      ...prev,
                      { ...emptyRow(), accountId: defaultAccount },
                    ])
                  }
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  + Add line
                </button>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatAmount(total, currency)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

      <div className="flex items-center justify-between">
        {state.error ? (
          <span className="text-sm text-red-600">{state.error}</span>
        ) : (
          <span className="text-sm text-slate-500">
            Reduces what you owe the supplier (Accounts payable).
          </span>
        )}
        <button
          type="submit"
          disabled={pending || total <= 0n}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save debit note"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createGoodsReceiptAction,
  type InvState,
} from "@/app/actions/inventory";
import { parseAmount, formatAmount } from "@/lib/money";

type Option = { id: string; label: string };
type Row = { itemId: string; quantity: string; unitCost: string };

const initial: InvState = {};
const emptyRow = (): Row => ({ itemId: "", quantity: "1", unitCost: "" });

export function GoodsReceiptForm({
  suppliers,
  items,
  currency,
}: {
  suppliers: Option[];
  items: Option[];
  currency: string;
}) {
  const [state, action, pending] = useActionState(
    createGoodsReceiptAction,
    initial,
  );
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<Row[]>([
    { ...emptyRow(), itemId: items[0]?.id ?? "" },
  ]);

  const lineTotal = (r: Row): bigint => {
    const qty = Number(r.quantity || "0");
    const cost = parseAmount(r.unitCost || "0", currency);
    if (!Number.isFinite(qty)) return 0n;
    return BigInt(Math.round(qty * Number(cost)));
  };
  const total = useMemo(
    () => rows.reduce((s, r) => s + lineTotal(r), 0n),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, currency],
  );
  const payload = useMemo(
    () =>
      rows
        .filter((r) => r.itemId && Number(r.quantity) > 0)
        .map((r) => ({
          itemId: r.itemId,
          quantity: r.quantity || "0",
          unitCost: r.unitCost || "0",
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
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
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
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Reference (optional)</span>
          <input
            name="reference"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Qty</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Unit cost</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <select
                    value={row.itemId}
                    onChange={(e) => update(i, { itemId: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Select item…</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.label}
                      </option>
                    ))}
                  </select>
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
                    value={row.unitCost}
                    onChange={(e) => update(i, { unitCost: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
                  />
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
              <td className="px-3 py-2" colSpan={3}>
                <button
                  type="button"
                  onClick={() =>
                    setRows((prev) => [
                      ...prev,
                      { ...emptyRow(), itemId: items[0]?.id ?? "" },
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

      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="flex items-center justify-between">
        {state.error ? (
          <span className="text-sm text-red-600">{state.error}</span>
        ) : (
          <span className="text-sm text-slate-500">
            Increases stock and posts Dr Inventory / Cr Accounts payable.
          </span>
        )}
        <button
          type="submit"
          disabled={pending || total <= 0n || items.length === 0}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Receive goods"}
        </button>
      </div>
    </form>
  );
}

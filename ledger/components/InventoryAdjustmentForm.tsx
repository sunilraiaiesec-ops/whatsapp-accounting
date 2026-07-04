"use client";

import { useActionState, useState } from "react";

import {
  createInventoryAdjustmentAction,
  type InvState,
} from "@/app/actions/inventory";

type ItemOption = { id: string; label: string; onHand: string };
type AccountOption = { id: string; label: string };
type Row = { itemId: string; newQuantity: string };

const initial: InvState = {};
const emptyRow = (): Row => ({ itemId: "", newQuantity: "" });

function deltaLabel(onHand: string, newQty: string): string {
  if (newQty.trim() === "") return "—";
  const before = Number(onHand);
  const after = Number(newQty);
  if (Number.isNaN(after)) return "—";
  const delta = after - before;
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta}` : String(delta);
}

export function InventoryAdjustmentForm({
  items,
  adjustmentAccounts,
}: {
  items: ItemOption[];
  adjustmentAccounts: AccountOption[];
}) {
  const [state, action, pending] = useActionState(
    createInventoryAdjustmentAction,
    initial,
  );
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<Row[]>([
    { ...emptyRow(), itemId: items[0]?.id ?? "" },
  ]);

  const payload = rows
    .filter((r) => r.itemId && r.newQuantity.trim() !== "")
    .map((r) => ({ itemId: r.itemId, newQuantity: r.newQuantity.trim() }));
  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="mt-6 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Adjustment account (gain / loss)
          </span>
          <select
            name="adjustmentAccountId"
            defaultValue={adjustmentAccounts[0]?.id ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {adjustmentAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
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
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="w-28 px-3 py-2 text-right font-medium">On hand</th>
              <th className="w-28 px-3 py-2 text-right font-medium">New qty</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Change</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const item = items.find((it) => it.id === row.itemId);
              return (
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
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {item ? item.onHand : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="decimal"
                      value={row.newQuantity}
                      onChange={(e) => update(i, { newQuantity: e.target.value })}
                      placeholder={item ? item.onHand : "0"}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {item ? deltaLabel(item.onHand, row.newQuantity) : "—"}
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
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-3 py-2" colSpan={5}>
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
            </tr>
          </tfoot>
        </table>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Reason / notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          placeholder="e.g. Physical stock count on 30 June"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="flex items-center justify-between">
        {state.error ? (
          <span className="text-sm text-red-600">{state.error}</span>
        ) : (
          <span className="text-sm text-slate-500">
            Sets each item to its counted quantity. Increases post at average cost;
            decreases remove value proportionally.
          </span>
        )}
        <button
          type="submit"
          disabled={pending || payload.length === 0 || items.length === 0}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save adjustment"}
        </button>
      </div>
    </form>
  );
}

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
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

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
    <form action={action} className="space-y-6">
      <div className="card-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Adjustment details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Adjustment account (gain / loss)</span>
            <select
              name="adjustmentAccountId"
              defaultValue={adjustmentAccounts[0]?.id ?? ""}
              className="input-modern"
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
            <span className={labelClass}>Date</span>
            <input type="date" name="date" defaultValue={today} className="input-modern" />
          </label>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Line items
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <th className="px-4 py-3">Item</th>
                <th className="w-28 px-4 py-3 text-right">On hand</th>
                <th className="w-28 px-4 py-3 text-right">New qty</th>
                <th className="w-24 px-4 py-3 text-right">Change</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const item = items.find((it) => it.id === row.itemId);
                return (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5">
                      <select
                        value={row.itemId}
                        onChange={(e) => update(i, { itemId: e.target.value })}
                        className="input-modern py-2"
                      >
                        <option value="">Select item…</option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--muted)]">
                      {item ? item.onHand : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        inputMode="decimal"
                        value={row.newQuantity}
                        onChange={(e) => update(i, { newQuantity: e.target.value })}
                        placeholder={item ? item.onHand : "0"}
                        className="input-modern py-2 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                      {item ? deltaLabel(item.onHand, row.newQuantity) : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {rows.length > 1 ? (
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
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[var(--border)] bg-slate-50/50 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() =>
              setRows((prev) => [...prev, { ...emptyRow(), itemId: items[0]?.id ?? "" }])
            }
            className="text-sm font-semibold text-[var(--brand)] hover:underline"
          >
            + Add line
          </button>
        </div>
      </div>

      <div className="card-surface p-5 sm:p-6">
        <label className="block">
          <span className={labelClass}>Reason / notes (optional)</span>
          <textarea
            name="notes"
            rows={3}
            placeholder="e.g. Physical stock count on 30 June"
            className="input-modern resize-y"
          />
        </label>
      </div>

      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {state.error ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{state.error}</p>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Sets each item to its counted quantity. Increases post at average cost;
            decreases remove value proportionally.
          </p>
        )}
        <button
          type="submit"
          disabled={pending || payload.length === 0 || items.length === 0}
          className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save adjustment"}
        </button>
      </div>
    </form>
  );
}

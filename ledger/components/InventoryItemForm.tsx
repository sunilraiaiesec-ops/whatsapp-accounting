"use client";

import { useActionState } from "react";

import {
  createInventoryItemAction,
  type InvState,
} from "@/app/actions/inventory";

const initial: InvState = {};

export function InventoryItemForm({ currency }: { currency: string }) {
  const [state, action, pending] = useActionState(
    createInventoryItemAction,
    initial,
  );

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Code</span>
        <input
          name="code"
          required
          placeholder="SKU-001"
          className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Name</span>
        <input
          name="name"
          required
          placeholder="Item name"
          className="mt-1 w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Sale price ({currency})</span>
        <input
          name="salePrice"
          inputMode="decimal"
          placeholder="0"
          className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Barcode</span>
        <input
          name="barcode"
          placeholder="Optional"
          className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Unit</span>
        <input
          name="unit"
          placeholder="e.g. case, unit, kg"
          className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Reorder level</span>
        <input
          name="reorderLevel"
          inputMode="decimal"
          placeholder="0"
          className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Tax %</span>
        <input
          name="defaultTaxRate"
          inputMode="decimal"
          placeholder="0"
          className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add item"}
      </button>
      {state.error ? (
        <span className="text-sm text-red-600">{state.error}</span>
      ) : null}
    </form>
  );
}

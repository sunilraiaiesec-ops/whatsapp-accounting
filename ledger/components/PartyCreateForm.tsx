"use client";

import { useActionState } from "react";

import { createPartyAction, type PartyState } from "@/app/actions/parties";

const initial: PartyState = {};

export function PartyCreateForm({
  defaultType = "customer",
}: {
  defaultType?: "customer" | "supplier" | "both";
}) {
  const [state, action, pending] = useActionState(createPartyAction, initial);

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Name</span>
        <input
          name="name"
          required
          className="mt-1 w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Type</span>
        <select
          name="type"
          defaultValue={defaultType}
          className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="customer">Customer</option>
          <option value="supplier">Supplier</option>
          <option value="both">Both</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Phone (optional)</span>
        <input
          name="phone"
          className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add contact"}
      </button>
      {state.error ? (
        <span className="text-sm text-red-600">{state.error}</span>
      ) : null}
    </form>
  );
}

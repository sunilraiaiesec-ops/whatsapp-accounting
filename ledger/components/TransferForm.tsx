"use client";

import { useActionState } from "react";

import {
  createInterAccountTransferAction,
  type DocState,
} from "@/app/actions/documents";
import { updateInterAccountTransferAction } from "@/app/actions/document-update";

type Option = { id: string; label: string };

const initial: DocState = {};

export function TransferForm({
  accounts,
  currency,
  documentId,
  defaults,
}: {
  accounts: Option[];
  currency: string;
  documentId?: string;
  defaults?: {
    date: string;
    fromAccountId: string;
    toAccountId: string;
    amount: string;
    reference: string;
    description: string;
  };
}) {
  const [state, action, pending] = useActionState(
    documentId ? updateInterAccountTransferAction : createInterAccountTransferAction,
    initial,
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="mt-6 space-y-5">
      {documentId ? <input type="hidden" name="id" value={documentId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">From account</span>
          <select
            name="fromAccountId"
            defaultValue={defaults?.fromAccountId ?? accounts[0]?.id ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">To account</span>
          <select
            name="toAccountId"
            defaultValue={defaults?.toAccountId ?? accounts[1]?.id ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Amount ({currency})</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="0"
            defaultValue={defaults?.amount ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Date</span>
          <input
            type="date"
            name="date"
            defaultValue={defaults?.date ?? today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Reference (optional)</span>
          <input
            name="reference"
            defaultValue={defaults?.reference ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Description (optional)</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={defaults?.description ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        {state.error ? (
          <span className="text-sm text-red-600">{state.error}</span>
        ) : (
          <span className="text-sm text-slate-500">
            Moves money from one account to another. The ledger stays balanced.
          </span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Saving…" : documentId ? "Save changes" : "Save transfer"}
        </button>
      </div>
    </form>
  );
}

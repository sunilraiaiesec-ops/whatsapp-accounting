"use client";

import { useActionState } from "react";

import {
  createInterAccountTransferAction,
  type DocState,
} from "@/app/actions/documents";
import { updateInterAccountTransferAction } from "@/app/actions/document-update";

type Option = { id: string; label: string };

const initial: DocState = {};
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function TransferForm({
  accounts,
  fromAccounts,
  toAccounts,
  fromLabel = "From account",
  toLabel = "To account",
  submitLabel,
  currency,
  documentId,
  defaults,
}: {
  accounts: Option[];
  fromAccounts?: Option[];
  toAccounts?: Option[];
  fromLabel?: string;
  toLabel?: string;
  submitLabel?: string;
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
  const fromList = fromAccounts ?? accounts;
  const toList = toAccounts ?? accounts;

  return (
    <form action={action} className="space-y-6">
      {documentId ? <input type="hidden" name="id" value={documentId} /> : null}

      <div className="card-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Transfer details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>{fromLabel}</span>
            <select
              name="fromAccountId"
              defaultValue={defaults?.fromAccountId ?? fromList[0]?.id ?? ""}
              className="input-modern"
            >
              <option value="">Select…</option>
              {fromList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>{toLabel}</span>
            <select
              name="toAccountId"
              defaultValue={defaults?.toAccountId ?? toList[0]?.id ?? ""}
              className="input-modern"
            >
              <option value="">Select…</option>
              {toList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Amount ({currency})</span>
            <input
              name="amount"
              inputMode="decimal"
              required
              placeholder="0"
              defaultValue={defaults?.amount ?? ""}
              className="input-modern text-right tabular-nums"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Date</span>
            <input
              type="date"
              name="date"
              defaultValue={defaults?.date ?? today}
              className="input-modern"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelClass}>Reference (optional)</span>
            <input
              name="reference"
              defaultValue={defaults?.reference ?? ""}
              className="input-modern"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelClass}>Description (optional)</span>
            <textarea
              name="description"
              rows={2}
              defaultValue={defaults?.description ?? ""}
              className="input-modern resize-y"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {state.error ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{state.error}</p>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Moves money from one account to another. The ledger stays balanced.
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending
            ? "Saving…"
            : documentId
              ? "Save changes"
              : submitLabel ?? "Save transfer"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createSalesInvoiceAction,
  type DocState,
} from "@/app/actions/documents";
import { updateSalesInvoiceAction } from "@/app/actions/document-update";
import { parseAmount, formatAmount } from "@/lib/money";

type Option = { id: string; label: string };
type ItemOption = { id: string; label: string; name: string; salePrice: string };
type Row = {
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string;
  itemId: string;
};

const initial: DocState = {};
const emptyRow = (): Row => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  accountId: "",
  itemId: "",
});

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function SalesInvoiceForm({
  customers,
  incomeAccounts,
  items = [],
  salesAccountId = "",
  currency,
  documentId,
  defaults,
}: {
  customers: Option[];
  incomeAccounts: Option[];
  items?: ItemOption[];
  salesAccountId?: string;
  currency: string;
  documentId?: string;
  defaults?: {
    partyId: string;
    reference: string;
    date: string;
    dueDate: string;
    notes: string;
    lines: Row[];
  };
}) {
  const [state, action, pending] = useActionState(
    documentId ? updateSalesInvoiceAction : createSalesInvoiceAction,
    initial,
  );
  const today = new Date().toISOString().slice(0, 10);
  const defaultAccount = incomeAccounts[0]?.id ?? "";
  const [rows, setRows] = useState<Row[]>(
    defaults?.lines?.length
      ? defaults.lines
      : [{ ...emptyRow(), accountId: defaultAccount }],
  );

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
          itemId: r.itemId || undefined,
        })),
    [rows],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const selectItem = (i: number, itemId: string) => {
    if (!itemId) {
      update(i, { itemId: "" });
      return;
    }
    const item = items.find((it) => it.id === itemId);
    if (!item) return;
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === i
          ? {
              ...r,
              itemId,
              accountId: salesAccountId || r.accountId,
              unitPrice: item.salePrice,
              description: r.description.trim() ? r.description : item.name,
            }
          : r,
      ),
    );
  };

  return (
    <form action={action} className="space-y-6">
      {documentId ? <input type="hidden" name="id" value={documentId} /> : null}

      <div className="card-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Invoice details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Customer</span>
            <select
              name="partyId"
              defaultValue={defaults?.partyId ?? ""}
              className="input-modern"
              required
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Reference (optional)</span>
            <input
              name="reference"
              defaultValue={defaults?.reference ?? ""}
              className="input-modern"
              placeholder="PO number, job ref…"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Invoice date</span>
            <input
              type="date"
              name="date"
              defaultValue={defaults?.date ?? today}
              className="input-modern"
              required
            />
          </label>
          <label className="block">
            <span className={labelClass}>Due date (optional)</span>
            <input
              type="date"
              name="dueDate"
              defaultValue={defaults?.dueDate ?? ""}
              className="input-modern"
            />
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
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {items.length > 0 ? (
                  <th className="px-4 py-3">Item</th>
                ) : null}
                <th className="px-4 py-3">Description</th>
                <th className="w-20 px-4 py-3 text-right">Qty</th>
                <th className="w-28 px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3">Income account</th>
                <th className="w-28 px-4 py-3 text-right">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  {items.length > 0 ? (
                    <td className="px-4 py-2.5">
                      <select
                        value={row.itemId}
                        onChange={(e) => selectItem(i, e.target.value)}
                        className="input-modern py-2"
                      >
                        <option value="">— none —</option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  ) : null}
                  <td className="px-4 py-2.5">
                    <input
                      value={row.description}
                      onChange={(e) => update(i, { description: e.target.value })}
                      className="input-modern py-2"
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => update(i, { quantity: e.target.value })}
                      className="input-modern py-2 text-right tabular-nums"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      inputMode="decimal"
                      value={row.unitPrice}
                      onChange={(e) => update(i, { unitPrice: e.target.value })}
                      className="input-modern py-2 text-right tabular-nums"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.accountId}
                      onChange={(e) => update(i, { accountId: e.target.value })}
                      className="input-modern py-2"
                    >
                      <option value="">Select…</option>
                      {incomeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-900">
                    {formatAmount(lineTotal(row), currency)}
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
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-slate-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            type="button"
            onClick={() =>
              setRows((prev) => [...prev, { ...emptyRow(), accountId: defaultAccount }])
            }
            className="text-sm font-semibold text-[var(--brand)] hover:underline"
          >
            + Add line
          </button>
          <div className="text-right">
            <span className="text-sm text-[var(--muted)]">Invoice total</span>
            <p className="text-2xl font-bold tabular-nums text-slate-900">
              {formatAmount(total, currency)}{" "}
              <span className="text-base font-normal text-slate-400">{currency}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="card-surface p-5 sm:p-6">
        <label className="block">
          <span className={labelClass}>Notes (optional)</span>
          <textarea
            name="notes"
            rows={3}
            defaultValue={defaults?.notes ?? ""}
            className="input-modern resize-y"
            placeholder="Payment terms, thank-you message…"
          />
        </label>
      </div>

      <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {state.error ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{state.error}</p>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Posts to Accounts receivable and your income accounts.
          </p>
        )}
        <button
          type="submit"
          disabled={pending || total <= 0n}
          className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : documentId ? "Save changes" : "Save invoice"}
        </button>
      </div>
    </form>
  );
}

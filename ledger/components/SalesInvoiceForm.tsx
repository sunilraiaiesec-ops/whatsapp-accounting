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
    <form action={action} className="mt-6 space-y-5">
      {documentId ? <input type="hidden" name="id" value={documentId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Customer</span>
          <select
            name="partyId"
            defaultValue={defaults?.partyId ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
          <span className="text-sm font-medium text-slate-700">Reference (optional)</span>
          <input
            name="reference"
            defaultValue={defaults?.reference ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Invoice date</span>
          <input
            type="date"
            name="date"
            defaultValue={defaults?.date ?? today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Due date (optional)</span>
          <input
            type="date"
            name="dueDate"
            defaultValue={defaults?.dueDate ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              {items.length > 0 ? (
                <th className="px-3 py-2 font-medium">Item (optional)</th>
              ) : null}
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="w-20 px-3 py-2 text-right font-medium">Qty</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Unit price</th>
              <th className="px-3 py-2 font-medium">Income account</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                {items.length > 0 ? (
                  <td className="px-3 py-2">
                    <select
                      value={row.itemId}
                      onChange={(e) => selectItem(i, e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
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
                    {incomeAccounts.map((a) => (
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
              <td className="px-3 py-2" colSpan={items.length > 0 ? 5 : 4}>
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
          defaultValue={defaults?.notes ?? ""}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

      <div className="flex items-center justify-between">
        {state.error ? (
          <span className="text-sm text-red-600">{state.error}</span>
        ) : (
          <span className="text-sm text-slate-500">
            Total: {formatAmount(total, currency)} {currency}
          </span>
        )}
        <button
          type="submit"
          disabled={pending || total <= 0n}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Saving…" : documentId ? "Save changes" : "Save invoice"}
        </button>
      </div>
    </form>
  );
}

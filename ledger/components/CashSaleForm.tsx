"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createSalesReceiptAction,
  createRefundReceiptAction,
  type DocState,
} from "@/app/actions/documents";
import { parseAmount, formatAmount } from "@/lib/money";

type Option = { id: string; label: string };
type BankOption = Option & { balanceLabel?: string };
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

export function CashSaleForm({
  mode,
  parties,
  incomeAccounts,
  bankAccounts,
  items = [],
  salesAccountId = "",
  currency,
  defaults,
}: {
  mode: "sales_receipt" | "refund_receipt";
  parties: Option[];
  incomeAccounts: Option[];
  bankAccounts: BankOption[];
  items?: ItemOption[];
  salesAccountId?: string;
  currency: string;
  defaults?: { partyId?: string };
}) {
  const isSale = mode === "sales_receipt";
  const showItems = isSale && items.length > 0;

  const [state, action, pending] = useActionState(
    isSale ? createSalesReceiptAction : createRefundReceiptAction,
    initial,
  );
  const today = new Date().toISOString().slice(0, 10);
  const defaultAccount = incomeAccounts[0]?.id ?? "";
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
          itemId: showItems ? r.itemId || undefined : undefined,
        })),
    [rows, showItems],
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

  const bankLabel = isSale ? "Deposit to" : "Refund from";
  const partyLabel = "Customer (optional)";
  const totalLabel = isSale ? "Total received" : "Total refunded";
  const saveLabel = isSale ? "Save sales receipt" : "Save refund";
  const posting = isSale
    ? "Posts money into the account you choose and records the sale as income (stock items reduce inventory and post cost of goods sold)."
    : "Pays the refund out of the account you choose and reverses the income.";

  return (
    <form action={action} className="space-y-6">
      <div className="card-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>{partyLabel}</span>
            <select
              name="partyId"
              defaultValue={defaults?.partyId ?? ""}
              className="input-modern"
            >
              <option value="">Walk-in / no customer</option>
              {parties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>{bankLabel}</span>
            <select name="bankAccountId" className="input-modern" required>
              <option value="">Select account…</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Date</span>
            <input
              type="date"
              name="date"
              defaultValue={today}
              className="input-modern"
              required
            />
          </label>
          <label className="block">
            <span className={labelClass}>Reference (optional)</span>
            <input
              name="reference"
              className="input-modern"
              placeholder="Receipt no., order ref…"
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
                {showItems ? <th className="px-4 py-3">Item</th> : null}
                <th className="px-4 py-3">Description</th>
                <th className="w-20 px-4 py-3 text-right">Qty</th>
                <th className="w-28 px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3">{isSale ? "Income account" : "Account"}</th>
                <th className="w-28 px-4 py-3 text-right">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  {showItems ? (
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
            <span className="text-sm text-[var(--muted)]">{totalLabel}</span>
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
            className="input-modern resize-y"
            placeholder="Reason, memo…"
          />
        </label>
      </div>

      <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {state.error ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{state.error}</p>
        ) : (
          <p className="text-sm text-[var(--muted)]">{posting}</p>
        )}
        <button
          type="submit"
          disabled={pending || total <= 0n}
          className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : saveLabel}
        </button>
      </div>
    </form>
  );
}

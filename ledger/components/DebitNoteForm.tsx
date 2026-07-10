"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createDebitNoteAction,
  type DocState,
} from "@/app/actions/documents";
import { searchBantooEntities } from "@/app/actions/bantoo";
import { BantooCombobox } from "@/components/BantooCombobox";
import { parseAmount, formatAmount } from "@/lib/money";

type Option = { id: string; label: string };
type Row = {
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string;
  taxRate: string;
};

const initial: DocState = {};
const emptyRow = (): Row => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  accountId: "",
  taxRate: "",
});

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function DebitNoteForm({
  suppliers,
  expenseAccounts,
  currency,
}: {
  suppliers: Option[];
  expenseAccounts: Option[];
  currency: string;
}) {
  const [state, action, pending] = useActionState(createDebitNoteAction, initial);
  const today = new Date().toISOString().slice(0, 10);
  const defaultAccount = expenseAccounts[0]?.id ?? "";
  const [rows, setRows] = useState<Row[]>([
    { ...emptyRow(), accountId: defaultAccount },
  ]);

  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("");

  const lineTotal = (r: Row): bigint => {
    const qty = Number(r.quantity || "0");
    const price = parseAmount(r.unitPrice || "0", currency);
    if (!Number.isFinite(qty)) return 0n;
    return BigInt(Math.round(qty * Number(price)));
  };

  const taxOf = (r: Row): bigint => {
    const rate = parseFloat(r.taxRate);
    const net = lineTotal(r);
    if (!rate || rate <= 0 || net <= 0n) return 0n;
    return BigInt(Math.round((Number(net) * rate) / 100));
  };

  const subtotal = useMemo(
    () => rows.reduce((s, r) => s + lineTotal(r), 0n),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, currency],
  );
  const taxTotal = useMemo(
    () => rows.reduce((s, r) => s + taxOf(r), 0n),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, currency],
  );
  const total = subtotal + taxTotal;

  const linesPayload = useMemo(
    () =>
      rows
        .filter((r) => r.description.trim() && r.accountId)
        .map((r) => ({
          description: r.description,
          quantity: r.quantity || "1",
          unitPrice: r.unitPrice || "0",
          accountId: r.accountId,
          taxRate: r.taxRate.trim() || undefined,
        })),
    [rows],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="space-y-6">
      <div className="card-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Debit note details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <BantooCombobox
            label="Supplier"
            text={partyName}
            selectedId={partyId || null}
            options={suppliers}
            onSearch={(q) => searchBantooEntities("supplier", q).then((r) => r.candidates)}
            placeholder="Search or type a new supplier…"
            createLabel={(name) => `Create new supplier "${name}"`}
            onSelectExisting={(opt) => {
              setPartyId(opt.id);
              setPartyName(opt.label);
            }}
            onTextChange={(v) => {
              setPartyName(v);
              setPartyId("");
            }}
          />
          <label className="block">
            <span className={labelClass}>Supplier&apos;s reference (optional)</span>
            <input
              name="supplierRef"
              placeholder="Original bill number"
              className="input-modern"
            />
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
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <th className="px-4 py-3">Description</th>
                <th className="w-20 px-4 py-3 text-right">Qty</th>
                <th className="w-28 px-4 py-3 text-right">Unit price</th>
                <th className="w-20 px-4 py-3 text-right">Tax %</th>
                <th className="px-4 py-3">Expense / asset account</th>
                <th className="w-28 px-4 py-3 text-right">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
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
                    <input
                      inputMode="decimal"
                      value={row.taxRate}
                      onChange={(e) => update(i, { taxRate: e.target.value })}
                      className="input-modern py-2 text-right tabular-nums"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.accountId}
                      onChange={(e) => update(i, { accountId: e.target.value })}
                      className="input-modern py-2"
                    >
                      <option value="">Select…</option>
                      {expenseAccounts.map((a) => (
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
            {taxTotal > 0n ? (
              <div className="mb-1 space-y-0.5 text-sm text-[var(--muted)]">
                <div className="flex justify-end gap-6">
                  <span>Subtotal</span>
                  <span className="tabular-nums text-slate-700">{formatAmount(subtotal, currency)}</span>
                </div>
                <div className="flex justify-end gap-6">
                  <span>Tax</span>
                  <span className="tabular-nums text-slate-700">{formatAmount(taxTotal, currency)}</span>
                </div>
              </div>
            ) : null}
            <span className="text-sm text-[var(--muted)]">Debit note total</span>
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
          <textarea name="notes" rows={3} className="input-modern resize-y" />
        </label>
      </div>

      <input type="hidden" name="partyId" value={partyId} />
      <input type="hidden" name="partyName" value={partyId ? "" : partyName} />
      <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {state.error ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{state.error}</p>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Reduces what you owe the supplier (Accounts payable).
          </p>
        )}
        <button
          type="submit"
          disabled={pending || total <= 0n}
          className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save debit note"}
        </button>
      </div>
    </form>
  );
}

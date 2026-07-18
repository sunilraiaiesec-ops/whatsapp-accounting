"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  createSalesInvoiceAction,
  type DocState,
} from "@/app/actions/documents";
import { updateSalesInvoiceAction } from "@/app/actions/document-update";
import { searchBantooEntities } from "@/app/actions/bantoo";
import { BantooCombobox } from "@/components/BantooCombobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { parseAmount, formatAmount } from "@/lib/money";

type Option = { id: string; label: string };
type ItemOption = { id: string; label: string; name: string; salePrice: string };
type Row = {
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string;
  itemId: string;
  taxRate: string;
  // Display-only (never sent to the server — linesPayload below picks
  // fields explicitly) — the BantooCombobox for Item/Income Account needs
  // a controlled label to show, and it travels with the row object itself
  // (not a separate index-keyed map) so it survives reordering/duplication
  // correctly. Optional so `defaults.lines` from the edit page (which only
  // knows ids, not labels) still satisfies the type; resolved to a real
  // string during the rows-state initializer below.
  itemLabel?: string;
  accountLabel?: string;
};

const initial: DocState = {};
const emptyRow = (): Row => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  accountId: "",
  itemId: "",
  taxRate: "",
  itemLabel: "",
  accountLabel: "",
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
  orgName,
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
  // Shown beside the "INVOICE" wordmark, mirroring a real invoice's
  // company-info line — purely presentational, not persisted anywhere.
  orgName?: string;
}) {
  const [state, action, pending] = useActionState(
    documentId ? updateSalesInvoiceAction : createSalesInvoiceAction,
    initial,
  );
  const today = new Date().toISOString().slice(0, 10);
  const defaultAccount = incomeAccounts[0]?.id ?? "";
  const defaultAccountLabel = incomeAccounts.find((a) => a.id === defaultAccount)?.label ?? "";
  const [rows, setRows] = useState<Row[]>(() => {
    const base = defaults?.lines?.length
      ? defaults.lines
      : [{ ...emptyRow(), accountId: defaultAccount, accountLabel: defaultAccountLabel }];
    // defaults.lines (edit mode) only carries ids, not labels — resolve the
    // display label for each row's Item/Income Account combobox once here,
    // rather than a lookup on every render.
    return base.map((r) => ({
      ...r,
      itemLabel: r.itemLabel ?? items.find((it) => it.id === r.itemId)?.label ?? "",
      accountLabel: r.accountLabel ?? incomeAccounts.find((a) => a.id === r.accountId)?.label ?? "",
    }));
  });

  const [partyId, setPartyId] = useState(defaults?.partyId ?? "");
  const [partyName, setPartyName] = useState(
    () => customers.find((c) => c.id === defaults?.partyId)?.label ?? "",
  );
  const [dateValue, setDateValue] = useState(defaults?.date ?? today);
  const [dueDateValue, setDueDateValue] = useState(defaults?.dueDate ?? "");
  // Only offer the Draft-vs-Post choice at creation time. Editing an
  // existing Draft always just saves it (still a Draft) — finalizing is a
  // separate, explicit "Post" action from the invoice detail page, so
  // there's no ambiguity about what a save-time "post" button would do to
  // an invoice whose lines/total may have just changed.
  const canChooseDraft = !documentId;

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
          itemId: r.itemId || undefined,
          taxRate: r.taxRate.trim() || undefined,
        })),
    [rows],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // Pressing Enter in the last row appends a new one and focuses its
  // Description field — the highest-frequency action when entering many
  // line items shouldn't cost a trip to "+ Add line" every time. Also used
  // by duplicateRow below, which inserts mid-array rather than appending, so
  // this tracks an explicit target index rather than assuming "last row".
  const descRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocusIndex = useRef<number | null>(null);
  useEffect(() => {
    if (pendingFocusIndex.current !== null) {
      const idx = pendingFocusIndex.current;
      pendingFocusIndex.current = null;
      descRefs.current[idx]?.focus();
    }
  }, [rows.length]);

  const addRow = () => {
    setRows((prev) => {
      pendingFocusIndex.current = prev.length;
      return [...prev, { ...emptyRow(), accountId: defaultAccount, accountLabel: defaultAccountLabel }];
    });
  };

  // Cmd/Ctrl+D duplicates the current row (same item/price/tax/account,
  // fresh description cursor) right below it — for wholesale/distribution
  // invoices with many similar lines, retyping the same account/tax/price
  // per line is pure friction.
  const duplicateRow = (i: number) => {
    setRows((prev) => {
      pendingFocusIndex.current = i + 1;
      const next = [...prev];
      next.splice(i + 1, 0, { ...prev[i] });
      return next;
    });
  };

  const onRowKeyDown = (i: number) => (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      duplicateRow(i);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (i === rows.length - 1) addRow();
    else descRefs.current[i + 1]?.focus();
  };

  // Cmd/Ctrl+S -> save as draft (or the single "Save changes" button when
  // editing), Cmd/Ctrl+Enter -> save and post. Clicking a disabled button is
  // a no-op, so this stays safe when the invoice isn't saveable yet (no
  // lines / already pending) without duplicating that guard here.
  const draftButtonRef = useRef<HTMLButtonElement>(null);
  const postButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        draftButtonRef.current?.click();
      } else if (e.key === "Enter") {
        e.preventDefault();
        postButtonRef.current?.click();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const selectItem = (i: number, itemId: string) => {
    if (!itemId) {
      update(i, { itemId: "", itemLabel: "" });
      return;
    }
    const item = items.find((it) => it.id === itemId);
    if (!item) return;
    const forcedAccountId = salesAccountId || undefined;
    const forcedAccountLabel = forcedAccountId
      ? (incomeAccounts.find((a) => a.id === forcedAccountId)?.label ?? "")
      : undefined;
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === i
          ? {
              ...r,
              itemId,
              itemLabel: item.label,
              accountId: forcedAccountId ?? r.accountId,
              accountLabel: forcedAccountLabel ?? r.accountLabel,
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
        {/* A document-style anchor (mirrors how a paper/PDF invoice leads
            with "INVOICE" + the issuing company) rather than a generic
            "Invoice details" form label — gives the card something to
            actually look like the document being created, not just a
            settings panel. */}
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <p className="text-xl font-bold tracking-tight text-[var(--brand)]">INVOICE</p>
          {orgName ? (
            <p className="max-w-[60%] truncate text-sm font-medium text-slate-500">{orgName}</p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <BantooCombobox
            label="Customer"
            text={partyName}
            selectedId={partyId || null}
            options={customers}
            onSearch={(q) => searchBantooEntities("customer", q).then((r) => r.candidates)}
            placeholder="Search or type a new customer…"
            createLabel={(name) => `Create new customer "${name}"`}
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
            <DatePicker name="date" value={dateValue} onChange={setDateValue} />
          </label>
          <label className="block">
            <span className={labelClass}>Due date (optional)</span>
            <DatePicker name="dueDate" value={dueDateValue} onChange={setDueDateValue} />
          </label>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
          {/* A section header should read as a heading, not a field caption
              — text-sm/uppercase/muted was visually identical to every
              field label on the page (e.g. "Reference (optional)"),
              flattening the whole form into one gray blur. */}
          <h2 className="text-[15px] font-semibold text-slate-800">Line items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs font-semibold tracking-wider text-[var(--muted)] uppercase">
                {items.length > 0 ? (
                  <th className="py-3 pr-4 pl-5 sm:pl-6">Item</th>
                ) : null}
                <th className={`py-3 pr-4 ${items.length > 0 ? "pl-4" : "pl-5 sm:pl-6"}`}>
                  Description
                </th>
                <th className="w-20 px-4 py-3 text-right">Qty</th>
                <th className="w-28 px-4 py-3 text-right">Unit price</th>
                <th className="w-20 px-4 py-3 text-right">Tax %</th>
                <th className="px-4 py-3">Income account</th>
                <th className="w-32 py-3 pr-5 pl-4 text-right sm:pr-6">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {items.length > 0 ? (
                    <td className="py-1.5 pr-2 pl-2 sm:pl-3">
                      <BantooCombobox
                        hideLabel
                        label="Item"
                        text={row.itemLabel ?? ""}
                        selectedId={row.itemId || null}
                        options={items}
                        allowCreate={false}
                        placeholder="— none —"
                        inputClassName="cell-input"
                        onSelectExisting={(opt) => selectItem(i, opt.id)}
                        onTextChange={(v) => {
                          // Typing invalidates the previous pick — itemId is
                          // optional (a line can have no linked inventory
                          // item at all), so clearing it here mirrors the
                          // old native <select>'s "— none —" behavior.
                          if (!v.trim()) selectItem(i, "");
                          else update(i, { itemLabel: v, itemId: "" });
                        }}
                      />
                    </td>
                  ) : null}
                  <td className={`py-1.5 pr-2 ${items.length > 0 ? "pl-2" : "pl-2 sm:pl-3"}`}>
                    <input
                      ref={(el) => {
                        descRefs.current[i] = el;
                      }}
                      value={row.description}
                      onChange={(e) => update(i, { description: e.target.value })}
                      onKeyDown={onRowKeyDown(i)}
                      className="cell-input"
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => update(i, { quantity: e.target.value })}
                      onKeyDown={onRowKeyDown(i)}
                      className="cell-input text-right tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      inputMode="decimal"
                      value={row.unitPrice}
                      onChange={(e) => update(i, { unitPrice: e.target.value })}
                      onKeyDown={onRowKeyDown(i)}
                      className="cell-input text-right tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      inputMode="decimal"
                      value={row.taxRate}
                      onChange={(e) => update(i, { taxRate: e.target.value })}
                      onKeyDown={onRowKeyDown(i)}
                      className="cell-input text-right tabular-nums"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <BantooCombobox
                      hideLabel
                      label="Income account"
                      text={row.accountLabel ?? ""}
                      selectedId={row.accountId || null}
                      options={incomeAccounts}
                      allowCreate={false}
                      placeholder="Select…"
                      inputClassName="cell-input"
                      onSelectExisting={(opt) => update(i, { accountId: opt.id, accountLabel: opt.label })}
                      onTextChange={(v) =>
                        // Required field — unlike Item, typing here does NOT
                        // clear accountId; the row keeps its last valid
                        // account (never submits with a blank required
                        // field) until a real selection replaces it.
                        update(i, { accountLabel: v })
                      }
                    />
                  </td>
                  <td className="relative py-1.5 pr-5 pl-4 text-right font-medium tabular-nums text-slate-900 sm:pr-6">
                    {formatAmount(lineTotal(row), currency)}
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRows((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        // Hover/focus-revealed, not permanently visible — a
                        // rarely-used destructive action shouldn't add visual
                        // noise to every row of a dense table at rest.
                        // focus:opacity-100 keeps it reachable/visible for
                        // keyboard users tabbing through, not just mouse hover.
                        className="absolute top-1/2 right-0.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-200 group-hover:opacity-100"
                        aria-label="Remove line"
                      >
                        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                          <path d="M4 6h12M8 6V4.5A1.5 1.5 0 019.5 3h1A1.5 1.5 0 0112 4.5V6m-6.5 0 .6 9.4a1.5 1.5 0 001.497 1.6h3.806a1.5 1.5 0 001.497-1.6L14.5 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
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
            onClick={addRow}
            className="text-sm font-semibold text-[var(--brand)] hover:underline"
          >
            + Add line
          </button>
          <div className="text-right">
            <div className="mb-1 space-y-0.5 text-sm">
              <div className="flex justify-end gap-6">
                <span className={taxTotal > 0n ? "text-[var(--muted)]" : "text-slate-300"}>Subtotal</span>
                <span
                  className={`tabular-nums ${taxTotal > 0n ? "text-slate-700" : "text-slate-300"}`}
                >
                  {formatAmount(subtotal, currency)}
                </span>
              </div>
              <div className="flex justify-end gap-6">
                <span className={taxTotal > 0n ? "text-[var(--muted)]" : "text-slate-300"}>Tax</span>
                <span
                  className={`tabular-nums ${taxTotal > 0n ? "text-slate-700" : "text-slate-300"}`}
                >
                  {formatAmount(taxTotal, currency)}
                </span>
              </div>
            </div>
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

      <input type="hidden" name="partyId" value={partyId} />
      <input type="hidden" name="partyName" value={partyId ? "" : partyName} />
      <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {state.error ? (
          <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{state.error}</p>
        ) : !dateValue ? (
          // The invoice date used to be enforced by the native <input
          // required> attribute — a hidden input (needed to drive the
          // custom DatePicker) doesn't participate in HTML5 constraint
          // validation, so this now does the job explicitly instead of
          // silently losing the check.
          <p className="text-sm text-amber-700">Choose an invoice date.</p>
        ) : total <= 0n ? (
          // Explains why Save is disabled (an all-opacity-40 button with no
          // reason given reads as broken, not "waiting for input") rather
          // than just dimming the button and saying nothing.
          <p className="text-sm text-amber-700">Add at least one line item to save this invoice.</p>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Posts to Accounts receivable and your income accounts.
          </p>
        )}
        {canChooseDraft ? (
          <div className="flex gap-3">
            <button
              ref={draftButtonRef}
              type="submit"
              name="mode"
              value="draft"
              disabled={pending || total <= 0n || !dateValue}
              title="Save as draft (⌘S)"
              // rounded-full to match btn-brand's pill shape — this button
              // sits directly beside "Save and post" as a pair, so a
              // differently-shaped sibling was a more visible mismatch than
              // it matching input radius would have fixed.
              className="rounded-full border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save as draft"}
            </button>
            <button
              ref={postButtonRef}
              type="submit"
              name="mode"
              value="post"
              disabled={pending || total <= 0n || !dateValue}
              title="Save and post (⌘⏎)"
              className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save and post"}
            </button>
          </div>
        ) : (
          <button
            ref={draftButtonRef}
            type="submit"
            disabled={pending || total <= 0n || !dateValue}
            title="Save changes (⌘S)"
            className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>
    </form>
  );
}

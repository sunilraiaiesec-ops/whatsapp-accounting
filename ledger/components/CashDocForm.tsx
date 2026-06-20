"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { DocState } from "@/app/actions/documents";
import { parseAmount, formatAmount } from "@/lib/money";

type Option = { id: string; label: string };
type Row = { accountId: string; amount: string };

const initial: DocState = {};
const emptyRow = (accountId = ""): Row => ({ accountId, amount: "" });

type CashDefaults = {
  date: string;
  bankAccountId: string;
  partyId: string;
  reference: string;
  description: string;
  lines: Row[];
};

export function CashDocForm({
  mode,
  action,
  bankAccounts,
  parties,
  accounts,
  currency,
  documentId,
  defaults,
  defaultLineAccountId = "",
  saveLabel,
}: {
  mode: "receipt" | "payment";
  action: (prev: DocState, fd: FormData) => Promise<DocState>;
  bankAccounts: Option[];
  parties: Option[];
  accounts: Option[];
  currency: string;
  documentId?: string;
  defaults?: CashDefaults;
  defaultLineAccountId?: string;
  saveLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const tc = useTranslations("common");
  const t = useTranslations(mode === "receipt" ? "receipts" : "payments");
  const today = new Date().toISOString().slice(0, 10);
  const [bankAccountId, setBankAccountId] = useState(defaults?.bankAccountId ?? "");
  const [rows, setRows] = useState<Row[]>(
    defaults?.lines?.length
      ? defaults.lines
      : [emptyRow(defaultLineAccountId)],
  );

  const lineAccounts = useMemo(
    () => accounts.filter((a) => a.id !== bankAccountId),
    [accounts, bankAccountId],
  );

  const total = useMemo(
    () =>
      rows.reduce(
        (s, r) => (r.amount ? s + parseAmount(r.amount, currency) : s),
        0n,
      ),
    [rows, currency],
  );

  const linesPayload = useMemo(
    () => rows.filter((r) => r.accountId && r.amount),
    [rows],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const isReceipt = mode === "receipt";

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {documentId ? <input type="hidden" name="id" value={documentId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">{tc("date")}</span>
          <input
            type="date"
            name="date"
            defaultValue={defaults?.date ?? today}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            {isReceipt ? t("receivedInto") : t("paidFrom")}
          </span>
          <select
            name="bankAccountId"
            value={bankAccountId}
            onChange={(e) => {
              const next = e.target.value;
              setBankAccountId(next);
              setRows((prev) =>
                prev.map((r) => (r.accountId === next ? { ...r, accountId: "" } : r)),
              );
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          >
            <option value="">{tc("selectAccount")}</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            {isReceipt ? t("receivedFrom") : t("paidTo")} ({t("optionalParty")})
          </span>
          <select
            name="partyId"
            defaultValue={defaults?.partyId ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">{tc("referenceOptional")}</span>
          <input
            name="reference"
            defaultValue={defaults?.reference ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">{tc("descriptionOptional")}</span>
        <input
          name="description"
          defaultValue={defaults?.description ?? ""}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-600">
            {isReceipt ? t("creditLineHelp") : t("debitLineHelp")}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">
                {isReceipt ? t("creditAccount") : t("debitAccount")}
              </th>
              <th className="w-44 px-3 py-2 text-right font-medium">{t("amount")}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <select
                    value={row.accountId}
                    onChange={(e) => update(i, { accountId: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    required
                  >
                    <option value="">{tc("selectAccount")}</option>
                    {lineAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => update(i, { amount: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
                    required
                  />
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
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setRows((prev) => [...prev, emptyRow(defaultLineAccountId)])
                  }
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  {t("addLine")}
                </button>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatAmount(total, currency)} {currency}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

      <div className="flex items-center justify-between">
        {state.error ? (
          <span className="text-sm text-red-600">{state.error}</span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending || total <= 0n || !bankAccountId}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending
            ? tc("saving")
            : documentId
              ? t("saveChanges")
              : saveLabel ?? t("save")}
        </button>
      </div>
    </form>
  );
}

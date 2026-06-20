"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { DocState } from "@/app/actions/documents";
import { parseAmount, formatAmount } from "@/lib/money";

type Option = { id: string; label: string };
type BankOption = Option & { balanceLabel?: string };
type Row = { accountId: string; amount: string; memo: string };

const initial: DocState = {};
const emptyRow = (accountId = ""): Row => ({ accountId, amount: "", memo: "" });
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

const PAYMENT_METHODS = [
  { value: "cash", key: "methodCash" },
  { value: "mobile_money", key: "methodMobileMoney" },
  { value: "bank_transfer", key: "methodBankTransfer" },
  { value: "cheque", key: "methodCheque" },
  { value: "card", key: "methodCard" },
  { value: "other", key: "methodOther" },
] as const;

type CashDefaults = {
  date: string;
  bankAccountId: string;
  partyId: string;
  reference: string;
  description: string;
  paymentMethod?: string;
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
  formTitle,
  formSubtitle,
  cancelHref = mode === "receipt" ? "/receipts" : "/payments",
}: {
  mode: "receipt" | "payment";
  action: (prev: DocState, fd: FormData) => Promise<DocState>;
  bankAccounts: BankOption[];
  parties: Option[];
  accounts: Option[];
  currency: string;
  documentId?: string;
  defaults?: CashDefaults;
  defaultLineAccountId?: string;
  saveLabel?: string;
  formTitle?: string;
  formSubtitle?: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const tc = useTranslations("common");
  const t = useTranslations(mode === "receipt" ? "receipts" : "payments");
  const today = new Date().toISOString().slice(0, 10);
  const [bankAccountId, setBankAccountId] = useState(defaults?.bankAccountId ?? "");
  const [rows, setRows] = useState<Row[]>(
    defaults?.lines?.length ? defaults.lines : [emptyRow(defaultLineAccountId)],
  );

  const lineAccounts = useMemo(
    () => accounts.filter((a) => a.id !== bankAccountId),
    [accounts, bankAccountId],
  );

  const total = useMemo(
    () =>
      rows.reduce((s, r) => (r.amount ? s + parseAmount(r.amount, currency) : s), 0n),
    [rows, currency],
  );

  const linesPayload = useMemo(
    () =>
      rows
        .filter((r) => r.accountId && r.amount)
        .map((r) => ({
          accountId: r.accountId,
          amount: r.amount,
          memo: r.memo.trim() || undefined,
        })),
    [rows],
  );

  const selectedBank = bankAccounts.find((b) => b.id === bankAccountId);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const isReceipt = mode === "receipt";
  const canSubmit = !pending && total > 0n && !!bankAccountId;

  const partyLabel = isReceipt ? t("receivedFrom") : t("paidTo");
  const bankLabel = isReceipt ? t("depositTo") : t("paidFrom");
  const accountColumnLabel = isReceipt ? t("creditAccount") : t("category");

  return (
    <form action={formAction} className="mt-6">
      {documentId ? <input type="hidden" name="id" value={documentId} /> : null}

      <div className="card-surface overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {formTitle ?? (documentId ? t("editTitle") : t("newTitle"))}
            </h1>
            {formSubtitle ? (
              <p className="mt-1 text-sm text-[var(--muted)]">{formSubtitle}</p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("totalAmount")}
            </p>
            <p className="text-3xl font-bold tabular-nums text-slate-900">
              {formatAmount(total, currency)}
            </p>
            <p className="text-sm text-slate-400">{currency}</p>
          </div>
        </div>

        <div className="border-b border-[var(--border)] bg-slate-50/60 px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className={labelClass}>{partyLabel}</span>
              <select
                name="partyId"
                defaultValue={defaults?.partyId ?? ""}
                className="input-modern"
              >
                <option value="">{t("payeePlaceholder")}</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>{bankLabel}</span>
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
                className="input-modern"
                required
              >
                <option value="">{tc("selectAccount")}</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              {selectedBank?.balanceLabel ? (
                <p className="mt-1.5 text-xs text-[var(--muted)]">
                  {t("accountBalance")}:{" "}
                  <span className="font-semibold tabular-nums text-slate-700">
                    {selectedBank.balanceLabel}
                  </span>
                </p>
              ) : null}
            </label>
            <label className="block">
              <span className={labelClass}>{t("paymentDate")}</span>
              <input
                type="date"
                name="date"
                defaultValue={defaults?.date ?? today}
                className="input-modern"
                required
              />
            </label>
            <label className="block">
              <span className={labelClass}>{tc("paymentMethod")}</span>
              <select
                name="paymentMethod"
                defaultValue={defaults?.paymentMethod ?? ""}
                className="input-modern"
              >
                <option value="">{tc("selectMethod")}</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {tc(m.key)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>{t("refNo")}</span>
              <input
                name="reference"
                defaultValue={defaults?.reference ?? ""}
                className="input-modern"
                placeholder={t("refPlaceholder")}
              />
            </label>
          </div>
        </div>

        <div className="border-b border-[var(--border)] px-5 py-3 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("categoryDetails")}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <th className="w-10 px-4 py-3">#</th>
                <th className="px-4 py-3">{accountColumnLabel}</th>
                <th className="px-4 py-3">{t("lineDescription")}</th>
                <th className="w-36 px-4 py-3 text-right">
                  {t("amount")} ({currency})
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 text-center text-xs text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.accountId}
                      onChange={(e) => update(i, { accountId: e.target.value })}
                      className="input-modern py-2"
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
                  <td className="px-4 py-2.5">
                    <input
                      value={row.memo}
                      onChange={(e) => update(i, { memo: e.target.value })}
                      className="input-modern py-2"
                      placeholder={t("lineDescriptionPlaceholder")}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(e) => update(i, { amount: e.target.value })}
                      className="input-modern py-2 text-right tabular-nums"
                      required
                    />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRows((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={t("removeLine")}
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
        <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-slate-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, emptyRow(defaultLineAccountId)])}
              className="text-sm font-semibold text-[var(--brand)] hover:underline"
            >
              {t("addLine")}
            </button>
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => setRows([emptyRow(defaultLineAccountId)])}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                {t("clearAllLines")}
              </button>
            ) : null}
          </div>
          <div className="text-right">
            <span className="text-sm text-[var(--muted)]">{t("subtotal")}</span>
            <p className="text-lg font-semibold tabular-nums text-slate-900">
              {formatAmount(total, currency)} {currency}
            </p>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <label className="block">
            <span className={labelClass}>{t("memo")}</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={defaults?.description ?? ""}
              className="input-modern resize-y"
              placeholder={t("memoPlaceholder")}
            />
          </label>
        </div>

        <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />

        <div className="flex flex-col-reverse gap-3 border-t border-[var(--border)] bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link
            href={cancelHref}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            {tc("cancel")}
          </Link>
          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
            {state.error ? (
              <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
                {state.error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending
                ? tc("saving")
                : documentId
                  ? t("saveChanges")
                  : saveLabel ?? t("saveAndClose")}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

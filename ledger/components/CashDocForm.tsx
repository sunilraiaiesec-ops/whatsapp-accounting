"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { DocState } from "@/app/actions/documents";
import { parseAmount, formatAmount } from "@/lib/money";

type Option = { id: string; label: string };
type BankOption = Option & { balanceLabel?: string };
type Row = { accountId: string; amount: string; memo: string; className: string };

const initial: DocState = {};
const emptyRow = (accountId = ""): Row => ({ accountId, amount: "", memo: "", className: "" });
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
  tags?: string[];
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
  classOptions = [],
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
  classOptions?: string[];
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
  const [tags, setTags] = useState<string[]>(defaults?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");

  const addTag = (value: string) => {
    const t = value.trim().replace(/,$/, "").trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= 20 ? prev : [...prev, t]));
    setTagDraft("");
  };

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
          className: r.className.trim() || undefined,
        })),
    [rows],
  );

  const selectedBank = bankAccounts.find((b) => b.id === bankAccountId);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const duplicate = (i: number) =>
    setRows((prev) => {
      const next = [...prev];
      next.splice(i + 1, 0, { ...prev[i]! });
      return next;
    });

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

          <div className="mt-4">
            <span className={labelClass}>{tc("tags")}</span>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--brand)]/10 px-2.5 py-1 text-xs font-medium text-[var(--brand)]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== tag))}
                    className="text-[var(--brand)]/70 hover:text-[var(--brand)]"
                    aria-label={tc("removeTag")}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagDraft);
                  } else if (e.key === "Backspace" && !tagDraft && tags.length) {
                    setTags((prev) => prev.slice(0, -1));
                  }
                }}
                onBlur={() => addTag(tagDraft)}
                className="min-w-[120px] flex-1 border-0 bg-transparent p-0 text-sm outline-none focus:ring-0"
                placeholder={tc("tagsPlaceholder")}
              />
            </div>
            <input type="hidden" name="tags" value={JSON.stringify(tags)} />
          </div>
        </div>

        <div className="border-b border-[var(--border)] px-5 py-3 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("categoryDetails")}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <th className="w-10 px-4 py-3">#</th>
                <th className="px-4 py-3">{accountColumnLabel}</th>
                <th className="px-4 py-3">{t("lineDescription")}</th>
                <th className="w-44 px-4 py-3">{tc("class")}</th>
                <th className="w-36 px-4 py-3 text-right">
                  {t("amount")} ({currency})
                </th>
                <th className="w-20" />
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
                      value={row.className}
                      onChange={(e) => update(i, { className: e.target.value })}
                      list="cashdoc-class-options"
                      className="input-modern py-2"
                      placeholder={tc("classPlaceholder")}
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
                  <td className="px-2 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => duplicate(i)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        aria-label={t("duplicateLine")}
                        title={t("duplicateLine")}
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                      {rows.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setRows((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={t("removeLine")}
                          title={t("removeLine")}
                        >
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 6h18" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
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
        {classOptions.length > 0 ? (
          <datalist id="cashdoc-class-options">
            {classOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        ) : null}

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
              type="button"
              onClick={() => window.print()}
              className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              {t("print")}
            </button>
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

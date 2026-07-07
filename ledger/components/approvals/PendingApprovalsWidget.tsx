"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  approvePendingTransactionAction,
  rejectPendingTransactionAction,
  requestCorrectionAction,
  type ApprovalActionState,
} from "@/app/actions/approvals";
import type { RiskLevel, RiskReview } from "@/lib/approvals/types";

export type PendingApprovalRowVM = {
  id: string;
  typeLabel: string;
  amountLabel: string;
  partyName: string | null;
  description: string | null;
  submittedByName: string;
  submittedAtLabel: string;
  aiConfidence: number | null;
  aiRiskReview: RiskReview | null;
  hasAttachment: boolean;
};

const initial: ApprovalActionState = {};

function riskBadgeClass(level: RiskLevel): string {
  if (level === "high") return "bg-red-100 text-red-700";
  if (level === "medium") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

// §11 dashboard "Pending Approvals" widget. Only rendered for users with
// `approveTransactions` (Owner/Admin/Accountant — see the server-side gate
// in app/(app)/dashboard/page.tsx); this component itself does not re-check
// permission, since the real enforcement happens server-side inside every
// action it calls (approvePendingTransaction/etc. in lib/approvals/engine.ts).
export function PendingApprovalsWidget({ items }: { items: PendingApprovalRowVM[] }) {
  const t = useTranslations("approvals");
  if (items.length === 0) return null;

  return (
    <section className="mt-5 rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span aria-hidden>🕓</span>
        {t("widgetTitle")} ({items.length})
      </h2>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <PendingApprovalRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function PendingApprovalRow({ item }: { item: PendingApprovalRowVM }) {
  const t = useTranslations("approvals");
  const [mode, setMode] = useState<"idle" | "reject" | "correct">("idle");

  const [approveState, approveAction, approvePending] = useActionState(
    approvePendingTransactionAction,
    initial,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectPendingTransactionAction,
    initial,
  );
  const [correctState, correctAction, correctPending] = useActionState(
    requestCorrectionAction,
    initial,
  );

  const error = approveState.error ?? rejectState.error ?? correctState.error;
  const resolved = Boolean(approveState.success || rejectState.success || correctState.success);
  if (resolved) return null;

  const risk = item.aiRiskReview;

  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {item.typeLabel}
            {item.partyName ? ` — ${item.partyName}` : ""}
          </p>
          <p className="text-xs text-slate-500">{t("submittedBy", { name: item.submittedByName })} · {item.submittedAtLabel}</p>
          {item.description ? <p className="mt-1 truncate text-xs text-slate-600">{item.description}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-slate-900">{item.amountLabel}</p>
          <p className="text-xs text-slate-400">{item.hasAttachment ? t("hasAttachment") : t("noAttachment")}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {risk ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${riskBadgeClass(risk.level)}`}>
            {t(risk.level === "high" ? "riskHigh" : risk.level === "medium" ? "riskMedium" : "riskLow")}
          </span>
        ) : null}
        {item.aiConfidence != null ? (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {t("aiConfidence", { confidence: Math.round(item.aiConfidence) })}
          </span>
        ) : null}
      </div>

      {risk && risk.signals.length > 0 ? (
        <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-slate-600">
          {risk.signals.map((s) => (
            <li key={s.code}>{s.detail}</li>
          ))}
        </ul>
      ) : null}
      {risk?.aiNarrative ? <p className="mt-1 text-xs italic text-slate-500">{risk.aiNarrative}</p> : null}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      {mode === "idle" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={approveAction}>
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              disabled={approvePending}
              className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {t("approve")}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode("reject")}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            {t("reject")}
          </button>
          <button
            type="button"
            onClick={() => setMode("correct")}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            {t("requestCorrection")}
          </button>
        </div>
      ) : null}

      {mode === "reject" ? (
        <form action={rejectAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          <input
            name="reason"
            required
            placeholder={t("reasonPlaceholder")}
            className="input-modern min-w-[14rem] flex-1 text-xs"
          />
          <button
            type="submit"
            disabled={rejectPending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {t("submit")}
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            {t("cancel")}
          </button>
        </form>
      ) : null}

      {mode === "correct" ? (
        <form action={correctAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          <input
            name="note"
            required
            placeholder={t("correctionPlaceholder")}
            className="input-modern min-w-[14rem] flex-1 text-xs"
          />
          <button
            type="submit"
            disabled={correctPending}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {t("submit")}
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            {t("cancel")}
          </button>
        </form>
      ) : null}
    </li>
  );
}

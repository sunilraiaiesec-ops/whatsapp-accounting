"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  requestOrgResetAction,
  verifyOrgResetCodeAction,
  cancelOrgResetAction,
  executeOrgResetAction,
  type ResetActionState,
} from "@/app/actions/org-reset";
import type { ResetStatus } from "@/lib/org-reset";

const initial: ResetActionState = {};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00:00";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

export function ResetBooksPanel({
  orgName,
  status,
}: {
  orgName: string;
  status: ResetStatus;
}) {
  const t = useTranslations("settings.reset");
  const tc = useTranslations("common");
  const [requestState, requestAction, requestPending] = useActionState(
    requestOrgResetAction,
    initial,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyOrgResetCodeAction,
    initial,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelOrgResetAction,
    initial,
  );
  const [executeState, executeAction, executePending] = useActionState(
    executeOrgResetAction,
    initial,
  );

  const [step, setStep] = useState(status.step);
  const [deleteAllowedAt, setDeleteAllowedAt] = useState(
    status.step === "cooldown" ? status.deleteAllowedAt : null,
  );
  const [email, setEmail] = useState(
    status.step === "awaiting_code" ? status.email : "",
  );
  const [now, setNow] = useState(() => Date.now());
  const [confirmName, setConfirmName] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect -- sync local wizard step from server action status */
  useEffect(() => {
    setStep(status.step);
    if (status.step === "cooldown") setDeleteAllowedAt(status.deleteAllowedAt);
    if (status.step === "awaiting_code") setEmail(status.email);
  }, [status]);

  useEffect(() => {
    if (step !== "cooldown" && step !== "ready") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (verifyState.deleteAllowedAt) {
      setDeleteAllowedAt(verifyState.deleteAllowedAt);
      setStep("cooldown");
    }
  }, [verifyState.deleteAllowedAt]);

  const cooldownRemaining = useMemo(() => {
    if (!deleteAllowedAt) return 0;
    return new Date(deleteAllowedAt).getTime() - now;
  }, [deleteAllowedAt, now]);

  useEffect(() => {
    if (step === "cooldown" && cooldownRemaining <= 0) {
      setStep("ready");
    }
  }, [step, cooldownRemaining]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const message =
    executeState.success ??
    verifyState.success ??
    requestState.success ??
    cancelState.success;
  const error =
    executeState.error ??
    verifyState.error ??
    requestState.error ??
    cancelState.error;

  if (executeState.success) {
    return (
      <section className="rounded-xl border border-green-200 bg-green-50 p-5">
        <h2 className="text-sm font-semibold text-green-900">{t("doneTitle")}</h2>
        <p className="mt-2 text-sm text-green-800">{executeState.success}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-red-200 bg-red-50/40 p-5">
      <h2 className="text-sm font-semibold text-red-900">{t("title")}</h2>
      <p className="mt-2 text-sm text-slate-700">{t("description")}</p>
      <ul className="mt-3 list-inside list-disc text-sm text-slate-600">
        <li>{t("removesTransactions")}</li>
        <li>{t("removesParties")}</li>
        <li>{t("removesCustomAccounts")}</li>
        <li>{t("keepsLogin")}</li>
      </ul>

      {message ? (
        <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {step === "none" ? (
        <form action={requestAction} className="mt-5">
          <button
            type="submit"
            disabled={requestPending}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {requestPending ? tc("saving") : t("sendCode")}
          </button>
        </form>
      ) : null}

      {step === "awaiting_code" ? (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-slate-700">
            {t("codeSent", { email: maskEmail(email) })}
          </p>
          <form action={verifyAction} className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                {t("enterCode")}
              </span>
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                className="input-modern w-40 tracking-widest"
                placeholder="000000"
              />
            </label>
            <button
              type="submit"
              disabled={verifyPending}
              className="btn-brand disabled:opacity-50"
            >
              {verifyPending ? tc("saving") : t("verifyCode")}
            </button>
          </form>
          <form action={cancelAction}>
            <button
              type="submit"
              disabled={cancelPending}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              {t("cancelRequest")}
            </button>
          </form>
        </div>
      ) : null}

      {step === "cooldown" ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-slate-700">{t("cooldownIntro")}</p>
          <p className="text-3xl font-bold tabular-nums text-slate-900">
            {formatCountdown(cooldownRemaining)}
          </p>
          <p className="text-xs text-slate-500">{t("cooldownHint")}</p>
          <form action={cancelAction}>
            <button
              type="submit"
              disabled={cancelPending}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              {t("cancelRequest")}
            </button>
          </form>
        </div>
      ) : null}

      {step === "ready" ? (
        <div className="mt-5 space-y-4">
          <p className="text-sm font-medium text-red-800">{t("readyIntro")}</p>
          <form action={executeAction} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                {t("confirmLabel", { name: orgName })}
              </span>
              <input
                name="confirmName"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                className="input-modern"
                placeholder={orgName}
                required
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={executePending || confirmName.trim() !== orgName.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {executePending ? tc("saving") : t("resetNow")}
              </button>
            </div>
          </form>
          <form action={cancelAction}>
            <button
              type="submit"
              disabled={cancelPending}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              {t("cancelRequest")}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

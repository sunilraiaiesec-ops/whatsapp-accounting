"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { toggleApprovalWorkflowAction, type SettingsActionState } from "@/app/actions/approvals";

const initial: SettingsActionState = {};

// §11 org-level toggle, rendered in Settings for anyone with `manageSettings`
// (Owner/Admin — see lib/permissions.ts). Once the parallel billing task's
// lib/billing/plans.ts feature flags land, this should be wrapped so the
// toggle only renders (and the underlying action only succeeds) when the
// org's plan includes `features.approvalWorkflow` — see the report.
export function ApprovalWorkflowToggle({ enabled }: { enabled: boolean }) {
  const t = useTranslations("settings.approvals");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState(toggleApprovalWorkflowAction, initial);

  return (
    <section className="card-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{t("title")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("description")}</p>
          <p className="mt-2 text-xs font-medium text-slate-600">{enabled ? t("statusOn") : t("statusOff")}</p>
        </div>
        <form action={action}>
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
          <button
            type="submit"
            disabled={pending}
            role="switch"
            aria-checked={enabled}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              enabled ? "bg-[var(--brand)]" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </form>
      </div>
      {state.error ? <p className="mt-3 text-sm text-red-700">{state.error}</p> : null}
      {pending ? <p className="mt-3 text-xs text-slate-400">{tc("saving")}</p> : null}
    </section>
  );
}

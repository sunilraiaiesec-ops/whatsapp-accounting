"use client";

import { useActionState } from "react";

import { adminSetOrgPlanAction, type AdminSetOrgPlanResult } from "@/app/actions/billing";

const initialState: AdminSetOrgPlanResult | null = null;

const PLAN_OPTIONS = ["FREE", "BUSINESS", "ENTERPRISE"] as const;
const STATUS_OPTIONS = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "FREE"] as const;

// Minimal end-to-end "set org plan" form — the only way to test a plan
// change without real payment credentials (see lib/billing/provider.ts).
// The org id is a plain pasted text field rather than a picker to keep this
// small; the orgs table above this form on the page lists every org's id
// for easy copy/paste.
export function AdminSetPlanForm() {
  const action = async (
    _prevState: AdminSetOrgPlanResult | null,
    formData: FormData,
  ): Promise<AdminSetOrgPlanResult> => {
    const orgId = String(formData.get("orgId") ?? "").trim();
    if (!orgId) return { error: "Enter an organization id." };
    return adminSetOrgPlanAction(orgId, formData);
  };

  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Organization ID</span>
          <input
            type="text"
            name="orgId"
            required
            placeholder="clxxxxxxxx..."
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Plan</span>
          <select
            name="plan"
            defaultValue="BUSINESS"
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            {PLAN_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Status</span>
          <select
            name="status"
            defaultValue="ACTIVE"
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Period (months)</span>
          <input
            type="number"
            name="periodMonths"
            min={1}
            defaultValue={1}
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Amount collected (optional)</span>
          <input
            type="text"
            name="amountMinorUnits"
            placeholder="e.g. 25000"
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-[var(--muted)]">
            In the org&apos;s own currency major units. Leave blank for a status-only change (no PaymentRecord
            written). Only recorded when status is ACTIVE.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Notes (optional)</span>
          <input
            type="text"
            name="notes"
            placeholder="e.g. Mobile Money transfer ref #123"
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
      </div>

      <button type="submit" disabled={pending} className="btn-brand text-sm disabled:opacity-50">
        {pending ? "Saving…" : "Set plan"}
      </button>

      {state && "error" in state ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state && "success" in state ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>
      ) : null}
    </form>
  );
}

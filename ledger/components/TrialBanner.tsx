"use client";

import { useState } from "react";
import Link from "next/link";

import type { PlanId } from "@/lib/billing/plans";

export type TrialBannerProps = {
  plan: PlanId;
  daysLeft: number;
  expired: boolean;
  // Backed by hasPermission(ctx, "manageBilling") (lib/permissions.ts) —
  // currently true for OWNER only.
  canManageBilling: boolean;
};

// A dismiss-per-session trial banner, styled to match the existing
// EmailVerifyBanner. Rendered from the (app) layout (not any single page) so
// it's visible everywhere, exactly like the email-verification banner.
export function TrialBanner({ plan, daysLeft, expired, canManageBilling }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const message = expired
    ? `Your ${plan} trial has ended. You're now on the Free plan — your data is safe, but some limits apply.`
    : `Your ${plan} trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`;

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3 text-sm ${
        expired
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-[var(--brand)]/30 bg-[var(--brand)]/5 text-slate-700"
      }`}
    >
      <span className="flex-1">{message}</span>
      {canManageBilling ? (
        <Link href="/settings" className="font-semibold text-[var(--brand)] underline">
          Manage plan
        </Link>
      ) : null}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-slate-400 hover:text-slate-700"
      >
        ✕
      </button>
    </div>
  );
}

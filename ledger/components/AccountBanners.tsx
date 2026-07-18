"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";

import { resendVerificationAction } from "@/app/actions/auth";
import type { PlanId } from "@/lib/billing/plans";

const STORAGE_KEY = "bantoo:dismissedBanners";

// Reads localStorage via useSyncExternalStore rather than useEffect+setState
// — the latter is flagged by this repo's React Compiler lint rule
// (react-hooks/set-state-in-effect) as a cascading-render anti-pattern, and
// useSyncExternalStore is the hook React actually provides for "sync
// mutable state from an external system" (getServerSnapshot avoids any
// hydration mismatch, since SSR always sees "no dismissals").
function subscribeNoop() {
  return () => {};
}

function getStoredDismissedSnapshot(): string {
  if (typeof window === "undefined") return "[]";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function getServerDismissedSnapshot(): string {
  return "[]";
}

function persistDismissed(key: string) {
  if (typeof window === "undefined") return;
  try {
    const current: string[] = JSON.parse(getStoredDismissedSnapshot());
    const next = new Set(current);
    next.add(key);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    /* localStorage unavailable (private mode etc.) — dismissal just won't persist */
  }
}

export type AccountBannersProps = {
  emailVerified: boolean;
  email: string;
  phoneVerified: boolean;
  trial: {
    plan: PlanId;
    daysLeft: number;
    expired: boolean;
    canManageBilling: boolean;
  } | null;
};

// Replaces the old EmailVerifyBanner/PhoneVerifyBanner/TrialBanner trio,
// which each tracked "dismissed" in local component state — meaning a
// dismissal never survived a route change and every banner the user was
// eligible for stacked on every single page. This shows AT MOST ONE banner
// at a time (priority: email verification > trial/plan status > phone
// verification, matching urgency: account access > money > optional
// convenience) and persists dismissal to localStorage so it actually stays
// dismissed across navigation.
export function AccountBanners({ emailVerified, email, phoneVerified, trial }: AccountBannersProps) {
  const storedRaw = useSyncExternalStore(
    subscribeNoop,
    getStoredDismissedSnapshot,
    getServerDismissedSnapshot,
  );
  const storedDismissed = useMemo(() => {
    try {
      return new Set<string>(JSON.parse(storedRaw));
    } catch {
      return new Set<string>();
    }
  }, [storedRaw]);
  // Dismissals made during this render session, applied instantly (no
  // round-trip through the external store) — persistDismissed() below still
  // writes them to localStorage so they also survive the next navigation.
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(new Set());
  const dismissed = useMemo(
    () => new Set([...storedDismissed, ...sessionDismissed]),
    [storedDismissed, sessionDismissed],
  );

  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const t = useTranslations("auth");

  function dismiss(key: string) {
    persistDismissed(key);
    setSessionDismissed((prev) => new Set(prev).add(key));
  }

  if (!emailVerified && !dismissed.has("email-verify")) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="flex-1">
          {sent ? (
            <>
              Verification email sent to <strong>{email}</strong>. Check your inbox and spam folder.
            </>
          ) : (
            <>
              Please confirm your email address (<strong>{email}</strong>) to secure your account.
            </>
          )}
        </span>
        {!sent ? (
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await resendVerificationAction();
                setSent(true);
              })
            }
            disabled={pending}
            className="font-semibold text-amber-900 underline disabled:opacity-50"
          >
            {pending ? "Sending…" : "Resend email"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => dismiss("email-verify")}
          aria-label="Dismiss"
          className="text-amber-500 hover:text-amber-800"
        >
          ✕
        </button>
      </div>
    );
  }

  if (trial) {
    // Keyed by expired-state (not just "trial") so a dismissal of "ends in
    // 4 days" doesn't silently suppress the more urgent "trial has ended"
    // message once it flips.
    const key = `trial:${trial.expired ? "expired" : "active"}`;
    if (!dismissed.has(key)) {
      const message = trial.expired
        ? `Your ${trial.plan} trial has ended. You're now on the Free plan — your data is safe, but some limits apply.`
        : `Your ${trial.plan} trial ends in ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"}.`;
      return (
        <div
          className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3 text-sm ${
            trial.expired
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-[var(--brand)]/30 bg-[var(--brand)]/5 text-slate-700"
          }`}
        >
          <span className="flex-1">{message}</span>
          {trial.canManageBilling ? (
            <Link href="/settings" className="font-semibold text-[var(--brand)] underline">
              Manage plan
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss(key)}
            aria-label="Dismiss"
            className="text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
      );
    }
  }

  if (!phoneVerified && !dismissed.has("phone-verify")) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <span className="flex-1">{t("phoneVerifyBanner")}</span>
        <Link href="/verify-phone" className="font-semibold text-sky-900 underline">
          {t("phoneVerifyBannerAction")}
        </Link>
        <button
          type="button"
          onClick={() => dismiss("phone-verify")}
          aria-label="Dismiss"
          className="text-sky-500 hover:text-sky-800"
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}

"use client";

import { useState, useTransition } from "react";

import { resendVerificationAction } from "@/app/actions/auth";

export function EmailVerifyBanner({ verified, email }: { verified: boolean; email: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (verified || dismissed) return null;

  function resend() {
    startTransition(async () => {
      await resendVerificationAction();
      setSent(true);
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span className="flex-1">
        {sent ? (
          <>Verification email sent to <strong>{email}</strong>. Check your inbox and spam folder.</>
        ) : (
          <>Please confirm your email address (<strong>{email}</strong>) to secure your account.</>
        )}
      </span>
      {!sent ? (
        <button
          type="button"
          onClick={resend}
          disabled={pending}
          className="font-semibold text-amber-900 underline disabled:opacity-50"
        >
          {pending ? "Sending…" : "Resend email"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-amber-500 hover:text-amber-800"
      >
        ✕
      </button>
    </div>
  );
}

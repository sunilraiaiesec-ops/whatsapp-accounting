"use client";

import Link from "next/link";
import { useActionState } from "react";

import { resetPasswordAction, type AuthState } from "@/app/actions/auth";

const initial: AuthState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  if (state.done) {
    return (
      <>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Your password has been updated. You can now sign in with your new password.
        </p>
        <Link href="/login" className="btn-brand mt-6 block w-full text-center">
          Go to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <p className="mt-1 text-sm text-[var(--muted)]">Choose a new password for your account.</p>
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">New password</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="input-modern mt-1"
          />
          <span className="mt-1 block text-xs text-slate-400">At least 8 characters.</span>
        </label>

        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

        <button type="submit" disabled={pending} className="btn-brand w-full disabled:opacity-50">
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordResetAction, type AuthState } from "@/app/actions/auth";
import { BrandLogo } from "@/components/BrandLogo";

const initial: AuthState = {};

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <div className="w-full max-w-sm card-surface p-8">
        <BrandLogo href="/login" size="auth" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Reset your password</h1>

        {state.done ? (
          <>
            <p className="mt-2 text-sm text-[var(--muted)]">
              If an account exists for that email, we&apos;ve sent a link to reset your password.
              Check your inbox (and spam folder). The link expires in 1 hour.
            </p>
            <Link href="/login" className="btn-brand mt-6 block w-full text-center">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>
            <form action={action} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="input-modern mt-1"
                />
              </label>

              {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

              <button type="submit" disabled={pending} className="btn-brand w-full disabled:opacity-50">
                {pending ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[var(--muted)]">
              <Link href="/login" className="font-semibold text-[var(--brand)] hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

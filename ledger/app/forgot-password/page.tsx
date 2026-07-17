"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { requestPasswordResetAction, type AuthState } from "@/app/actions/auth";
import {
  requestPhoneRecoveryAction,
  confirmPhoneRecoveryAction,
  type PhoneVerifyState,
} from "@/app/actions/phone-verification";
import { BrandLogo } from "@/components/BrandLogo";
import { PhoneField } from "@/components/PhoneField";

const initial: AuthState = {};
const phoneInitial: PhoneVerifyState = {};

function PhoneRecoveryForm() {
  const [codeSent, setCodeSent] = useState(false);
  const [sendState, sendAction, sendPending] = useActionState(
    async (prev: PhoneVerifyState, formData: FormData) => {
      const result = await requestPhoneRecoveryAction(prev, formData);
      if (result.codeSent) setCodeSent(true);
      return result;
    },
    phoneInitial,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmPhoneRecoveryAction,
    phoneInitial,
  );

  if (!codeSent) {
    return (
      <form action={sendAction} className="mt-6 space-y-4">
        <p className="text-sm text-[var(--muted)]">
          Only works for a phone number you&apos;ve already verified on your account.
        </p>
        <PhoneField label="Phone number" name="phone" />
        {sendState.error ? <p className="text-sm text-red-600">{sendState.error}</p> : null}
        <button type="submit" disabled={sendPending} className="btn-brand w-full disabled:opacity-50">
          {sendPending ? "Sending…" : "Send recovery code"}
        </button>
      </form>
    );
  }

  return (
    <form action={confirmAction} className="mt-6 space-y-4">
      <p className="text-sm text-[var(--muted)]">
        If that phone number has a verified account, a recovery code was sent by SMS. Enter it
        below.
      </p>
      {/* The number they just requested a code for isn't tracked in this
          component's state — re-collecting it here keeps the action's input
          shape self-contained (phone + code together) rather than needing a
          hidden field threaded through from the first form. */}
      <PhoneField label="Phone number" name="phone" />
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Recovery code</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          className="input-modern mt-1 text-center text-lg tracking-[0.5em]"
        />
      </label>
      {confirmState.error ? <p className="text-sm text-red-600">{confirmState.error}</p> : null}
      <button type="submit" disabled={confirmPending} className="btn-brand w-full disabled:opacity-50">
        {confirmPending ? "Verifying…" : "Verify and continue"}
      </button>
      <button
        type="button"
        onClick={() => setCodeSent(false)}
        className="block w-full text-center text-sm text-[var(--muted)] hover:text-[var(--brand)] hover:underline"
      >
        Resend or use a different number
      </button>
    </form>
  );
}

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  const [mode, setMode] = useState<"email" | "phone">("email");

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
        ) : mode === "phone" ? (
          <>
            <PhoneRecoveryForm />
            <p className="mt-6 text-center text-sm text-[var(--muted)]">
              <button
                type="button"
                onClick={() => setMode("email")}
                className="font-semibold text-[var(--brand)] hover:underline"
              >
                Use email instead
              </button>
            </p>
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
              <button
                type="button"
                onClick={() => setMode("phone")}
                className="font-semibold text-[var(--brand)] hover:underline"
              >
                Use phone instead
              </button>
            </p>
          </>
        )}

        {!state.done ? (
          <p className="mt-4 text-center text-sm text-[var(--muted)]">
            <Link href="/login" className="font-semibold text-[var(--brand)] hover:underline">
              Back to sign in
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}

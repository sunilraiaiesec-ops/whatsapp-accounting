"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthState } from "@/app/actions/auth";

const initial: AuthState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <div className="w-full max-w-sm card-surface p-8">
        <p className="text-lg font-bold text-[var(--brand)]">
          Bantoo<span className="text-slate-800">Books</span>
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Welcome back to your books.</p>

        <form action={action} className="mt-6 space-y-4">
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
          />

          {state.error ? (
            <p className="text-sm text-red-600">{state.error}</p>
          ) : null}

          <button type="submit" disabled={pending} className="btn-brand w-full disabled:opacity-50">
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          No account?{" "}
          <Link href="/signup" className="font-semibold text-[var(--brand)] hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="input-modern mt-1"
      />
    </label>
  );
}

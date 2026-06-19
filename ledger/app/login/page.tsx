"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthState } from "@/app/actions/auth";

const initial: AuthState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Bantoo Books
        </p>
        <h1 className="mt-2 text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back to your books.</p>

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

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          No account?{" "}
          <Link href="/signup" className="font-medium text-slate-900 underline">
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
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </label>
  );
}

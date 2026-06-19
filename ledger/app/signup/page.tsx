"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signupAction, type AuthState } from "@/app/actions/auth";

const initial: AuthState = {};

const CURRENCIES = ["XAF", "XOF", "USD", "EUR", "GBP", "NGN", "GHS", "KES"];

export default function SignupPage() {
  const [state, action, pending] = useActionState(signupAction, initial);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Create your company</h1>
        <p className="mt-1 text-sm text-slate-500">
          A fresh set of books with a chart of accounts, ready in seconds.
        </p>

        <form action={action} className="mt-6 space-y-4">
          <Field label="Your name" name="name" autoComplete="name" />
          <Field label="Company name" name="orgName" autoComplete="organization" />
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters"
          />

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Base currency
            </span>
            <select
              name="baseCurrency"
              defaultValue="XAF"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {state.error ? (
            <p className="text-sm text-red-600">{state.error}</p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create company"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-slate-900 underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
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
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

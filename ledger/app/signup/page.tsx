"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { signupAction, type AuthState } from "@/app/actions/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const initial: AuthState = {};

const CURRENCIES = ["XAF", "XOF", "USD", "EUR", "GBP", "NGN", "GHS", "KES"];

export default function SignupPage() {
  const [state, action, pending] = useActionState(signupAction, initial);
  const t = useTranslations("auth");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md card-surface p-8">
        <BrandLogo href="/signup" size="auth" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("signUp")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("signUpSubtitle")}</p>

        <form action={action} className="mt-6 space-y-4">
          <Field label={t("name")} name="name" autoComplete="name" />
          <Field label={t("companyName")} name="orgName" autoComplete="organization" />
          <Field label={t("email")} name="email" type="email" autoComplete="email" />
          <Field
            label={t("password")}
            name="password"
            type="password"
            autoComplete="new-password"
            hint={t("passwordHint")}
          />

          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t("currency")}</span>
            <select name="baseCurrency" defaultValue="XAF" className="input-modern mt-1">
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

          <button type="submit" disabled={pending} className="btn-brand w-full disabled:opacity-50">
            {pending ? t("creating") : t("createCompany")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          {t("hasAccount")}{" "}
          <Link href="/login" className="font-semibold text-[var(--brand)] hover:underline">
            {t("signInLink")}
          </Link>
        </p>

        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="hover:underline">Terms</Link>
          {" and "}
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>.
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
        className="input-modern mt-1"
      />
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

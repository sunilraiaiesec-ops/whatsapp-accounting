"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { loginAction, type AuthState } from "@/app/actions/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const initial: AuthState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initial);
  const t = useTranslations("auth");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm card-surface p-8">
        <BrandLogo href="/login" size="auth" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("signIn")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("signInSubtitle")}</p>

        <form action={action} className="mt-6 space-y-4">
          <Field label={t("email")} name="email" type="email" autoComplete="email" />
          <Field
            label={t("password")}
            name="password"
            type="password"
            autoComplete="current-password"
          />

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-[var(--brand)] hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </div>

          {state.error ? (
            <p className="text-sm text-red-600">{state.error}</p>
          ) : null}

          <button type="submit" disabled={pending} className="btn-brand w-full disabled:opacity-50">
            {pending ? t("signingIn") : t("signIn")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          {t("noAccount")}{" "}
          <Link href="/signup" className="font-semibold text-[var(--brand)] hover:underline">
            {t("createOne")}
          </Link>
        </p>

        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          <Link href="/terms" className="hover:underline">Terms</Link>
          {" · "}
          <Link href="/privacy" className="hover:underline">Privacy</Link>
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

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useActionState, useState } from "react";

import { signupAction, type AuthState } from "@/app/actions/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PhoneField } from "@/components/PhoneField";

const initial: AuthState = {};

const CURRENCIES = ["XAF", "XOF", "USD", "EUR", "GBP", "NGN", "GHS", "KES"];

const PLAN_VALUES = ["free", "professional", "enterprise"] as const;
type PlanParam = (typeof PLAN_VALUES)[number];

function parsePlanParam(value: string | null): PlanParam | null {
  return value && (PLAN_VALUES as readonly string[]).includes(value) ? (value as PlanParam) : null;
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initial);
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const plan = parsePlanParam(searchParams.get("plan"));
  const planLabel = plan ? t(`plan${plan[0].toUpperCase()}${plan.slice(1)}` as "planFree" | "planProfessional" | "planEnterprise") : null;

  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const emailMismatch = confirmEmail.length > 0 && email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md card-surface p-8">
        <BrandLogo href="/signup" size="auth" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("signUp")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("signUpSubtitle")}</p>
        {plan ? (
          <p className="mt-3 rounded-lg bg-[var(--brand)]/10 px-3 py-2 text-sm font-medium text-[var(--brand)]">
            {plan === "free" ? t("planConfirmFree") : t("planConfirmTrial", { plan: planLabel ?? "" })}
          </p>
        ) : null}

        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="plan" value={plan ?? ""} />
          <Field label={t("name")} name="name" autoComplete="name" />
          <Field label={t("companyName")} name="orgName" autoComplete="organization" />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t("email")}</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-modern mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t("confirmEmail")}</span>
            <input
              name="confirmEmail"
              type="email"
              autoComplete="email"
              required
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              className="input-modern mt-1"
            />
            {emailMismatch ? (
              <span className="mt-1 block text-xs text-red-600">{t("emailMismatch")}</span>
            ) : null}
          </label>
          <Field
            label={t("password")}
            name="password"
            type="password"
            autoComplete="new-password"
            hint={t("passwordHint")}
          />
          <PhoneField label={t("phone")} name="phone" />
          <PhoneField label={t("whatsapp")} name="whatsapp" required={false} hint={t("whatsappHint")} />

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
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  required?: boolean;
}) {
  const tc = useTranslations("common");
  const isPassword = type === "password";
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="relative mt-1">
        <input
          name={name}
          type={isPassword && visible ? "text" : type}
          autoComplete={autoComplete}
          required={required}
          className={`input-modern ${isPassword ? "pr-10" : ""}`}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? tc("hidePassword") : tc("showPassword")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {visible ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M1 12s3-8 11-8 11 8 11 8-3 8-11 8-11-8-11-8Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

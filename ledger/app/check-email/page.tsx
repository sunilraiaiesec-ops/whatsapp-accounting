"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useActionState, useState } from "react";

import {
  resendVerificationByEmailAction,
  changePendingEmailAction,
  type AuthState,
} from "@/app/actions/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const initial: AuthState = {};

function ChangeEmailForm({ oldEmail }: { oldEmail: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(changePendingEmailAction, initial);
  const t = useTranslations("auth");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 text-sm font-medium text-[var(--muted)] hover:text-[var(--brand)] hover:underline"
      >
        {t("wrongEmailLink")}
      </button>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-3 border-t border-[var(--border)] pt-4 text-left">
      <p className="text-xs text-[var(--muted)]">{t("changeEmailHint")}</p>
      <input type="hidden" name="oldEmail" value={oldEmail} />
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("password")}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input-modern mt-1"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("newEmail")}</span>
        <input name="newEmail" type="email" autoComplete="email" required className="input-modern mt-1" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("confirmNewEmail")}</span>
        <input
          name="confirmNewEmail"
          type="email"
          autoComplete="email"
          required
          onPaste={(e) => e.preventDefault()}
          className="input-modern mt-1"
        />
      </label>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="btn-brand w-full disabled:opacity-50">
        {pending ? t("resending") : t("changeEmailAction")}
      </button>
    </form>
  );
}

function CheckEmailForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const expired = searchParams.get("expired") === "1";
  const [state, action, pending] = useActionState(resendVerificationByEmailAction, initial);
  const t = useTranslations("auth");

  return (
    <div className="w-full max-w-sm card-surface p-8 text-center">
      <BrandLogo href="/login" size="auth" />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {expired ? t("linkExpiredTitle") : t("checkEmailTitle")}
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {expired
          ? t("linkExpiredSubtitle")
          : email
            ? t("checkEmailSubtitle", { email })
            : t("checkEmailNoEmail")}
      </p>

      <form action={action} className="mt-6 space-y-3 text-left">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">{t("email")}</span>
          <input
            name="email"
            type="email"
            defaultValue={email}
            autoComplete="email"
            required
            className="input-modern mt-1"
          />
        </label>

        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        {state.done ? <p className="text-sm text-[var(--brand)]">{t("resendSent")}</p> : null}

        <button type="submit" disabled={pending} className="btn-brand w-full disabled:opacity-50">
          {pending ? t("resending") : t("resendConfirmation")}
        </button>
      </form>

      {email ? <ChangeEmailForm oldEmail={email} /> : null}

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        <Link href="/login" className="font-semibold text-[var(--brand)] hover:underline">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Suspense fallback={null}>
        <CheckEmailForm />
      </Suspense>
    </main>
  );
}

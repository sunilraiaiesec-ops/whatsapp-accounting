"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  updatePasswordAction,
  updateProfileAction,
  type ProfileState,
} from "@/app/actions/profile";

const initial: ProfileState = {};

export function ProfileDetailsForm({
  name,
  email,
  phone,
}: {
  name: string;
  email: string;
  phone: string | null;
}) {
  const t = useTranslations("profile");
  const [state, action, pending] = useActionState(updateProfileAction, initial);

  return (
    <form action={action} className="card-surface space-y-4 p-6">
      <h2 className="text-sm font-semibold text-slate-900">{t("detailsTitle")}</h2>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("email")}</span>
        <input type="email" value={email} disabled className="input-modern mt-1 opacity-70" />
        <span className="mt-1 block text-xs text-[var(--muted)]">{t("emailHint")}</span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("name")}</span>
        <input
          type="text"
          name="name"
          required
          defaultValue={name}
          autoComplete="name"
          className="input-modern mt-1"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("phone")}</span>
        <input
          type="tel"
          name="phone"
          defaultValue={phone ?? ""}
          autoComplete="tel"
          placeholder={t("phonePlaceholder")}
          className="input-modern mt-1"
        />
      </label>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success === "profileUpdated" ? (
        <p className="text-sm text-[var(--brand)]" role="status">
          {t("saved")}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-brand disabled:opacity-50">
        {pending ? t("saving") : t("saveProfile")}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const t = useTranslations("profile");
  const [state, action, pending] = useActionState(updatePasswordAction, initial);

  return (
    <form action={action} className="card-surface space-y-4 p-6">
      <h2 className="text-sm font-semibold text-slate-900">{t("passwordTitle")}</h2>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("currentPassword")}</span>
        <input
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          className="input-modern mt-1"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("newPassword")}</span>
        <input
          type="password"
          name="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="input-modern mt-1"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("confirmPassword")}</span>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="input-modern mt-1"
        />
      </label>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success === "passwordUpdated" ? (
        <p className="text-sm text-[var(--brand)]" role="status">
          {t("passwordSaved")}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-brand disabled:opacity-50">
        {pending ? t("saving") : t("savePassword")}
      </button>
    </form>
  );
}

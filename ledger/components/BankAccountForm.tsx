"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import {
  createBankAccountAction,
  type AccountState,
} from "@/app/actions/accounts";

const initial: AccountState = {};

export function BankAccountForm() {
  const [state, action, pending] = useActionState(
    createBankAccountAction,
    initial,
  );
  const t = useTranslations("bank");

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="block">
        <span className="text-xs font-medium text-slate-600">{t("addName")}</span>
        <input
          name="name"
          required
          placeholder={t("addNamePlaceholder")}
          className="mt-1 w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">{t("addType")}</span>
        <select
          name="subtype"
          defaultValue="bank"
          className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="bank">{t("bankAccount")}</option>
          <option value="cash">{t("cashAccount")}</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? t("adding") : t("addButton")}
      </button>
      {state.error ? (
        <span className="text-sm text-red-600">{state.error}</span>
      ) : null}
    </form>
  );
}

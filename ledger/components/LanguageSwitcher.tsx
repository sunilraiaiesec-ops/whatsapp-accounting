"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLocaleAction } from "@/app/actions/locale";
import type { AppLocale } from "@/i18n/routing";

export function LanguageSwitcher({
  variant = "pill",
  onChange,
}: {
  variant?: "pill" | "menu";
  onChange?: () => void;
}) {
  const t = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchLocale(next: AppLocale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
      onChange?.();
    });
  }

  const buttonClass = (code: AppLocale) =>
    variant === "menu"
      ? `flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
          locale === code
            ? "bg-[var(--brand)] text-white"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`
      : `rounded-full px-2.5 py-1 transition ${
          locale === code
            ? "bg-[var(--brand)] text-white"
            : "text-slate-600 hover:text-slate-900"
        }`;

  return (
    <div
      className={
        variant === "menu"
          ? "grid grid-cols-2 gap-2"
          : "inline-flex rounded-full border border-[var(--border)] bg-white p-0.5 text-xs font-semibold shadow-sm"
      }
      role="group"
      aria-label={t("language")}
    >
      {(["fr", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          disabled={pending}
          onClick={() => switchLocale(code)}
          className={buttonClass(code)}
        >
          {code === "fr" ? t("french") : t("english")}
        </button>
      ))}
    </div>
  );
}

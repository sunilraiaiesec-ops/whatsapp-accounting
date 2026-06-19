"use server";

import { cookies } from "next/headers";

import { routing, type AppLocale } from "@/i18n/routing";

export async function setLocaleAction(locale: AppLocale) {
  if (!routing.locales.includes(locale)) return;
  const store = await cookies();
  store.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

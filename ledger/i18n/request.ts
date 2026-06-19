import { cookies, headers } from "next/headers";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing, type AppLocale } from "./routing";

function localeFromAcceptLanguage(header: string | null): AppLocale | undefined {
  if (!header) return undefined;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    const short = tag.split("-")[0];
    if (hasLocale(routing.locales, short)) return short;
  }
  return undefined;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  let locale =
    cookieStore.get("NEXT_LOCALE")?.value ??
    localeFromAcceptLanguage(headerStore.get("accept-language")) ??
    routing.defaultLocale;

  if (!hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

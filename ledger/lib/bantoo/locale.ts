import { cookies, headers } from "next/headers";
import { hasLocale } from "next-intl";

import { routing } from "@/i18n/routing";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

// QA Reliability Swarm (Track 9) fix: shared by app/api/bantoo/extract/route.ts
// (which locale to ask the AI to write `summary` in) and app/actions/bantoo.ts
// (which locale to render execute()'s own success/error strings in) — both
// need the exact same "what is the user's current UI locale" answer, resolved
// the SAME way i18n/request.ts resolves it for the page itself (NEXT_LOCALE
// cookie -> Accept-Language header -> routing.defaultLocale), so Ask Bantoo's
// text never disagrees with the rest of the app the user is looking at.
function localeFromAcceptLanguage(header: string | null): "en" | "fr" | undefined {
  if (!header) return undefined;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    const short = tag.split("-")[0];
    if (hasLocale(routing.locales, short)) return short;
  }
  return undefined;
}

export async function resolveUiLocale(): Promise<"en" | "fr"> {
  // `cookies()`/`headers()` throw when called outside a real Next.js request
  // scope (e.g. unit tests that call a server action/route handler directly,
  // with no request-context machinery around it) — fall back to the app's
  // default locale in that case rather than letting the caller blow up.
  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
    return (
      (cookieLocale && hasLocale(routing.locales, cookieLocale) ? cookieLocale : undefined) ??
      localeFromAcceptLanguage(headerStore.get("accept-language")) ??
      routing.defaultLocale
    );
  } catch {
    return routing.defaultLocale;
  }
}

const CATALOGS = { en, fr } as const;

// Minimal, dependency-free "translate a command.* key" helper for server
// code that runs outside next-intl's React-context machinery (server
// actions like executeBantooAction are invoked directly by dozens of unit
// tests with no request scope at all, where next-intl/server's
// getTranslations() would either throw or silently resolve the wrong
// locale). Reads the SAME messages/{locale}.json catalogs the client uses —
// single source of truth, zero risk of the two ever disagreeing — with the
// same `{param}` interpolation syntax next-intl uses.
export function tCommand(
  locale: "en" | "fr",
  key: string,
  params?: Record<string, string | number>,
): string {
  const command = CATALOGS[locale].command as Record<string, unknown>;
  const raw = key
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
      command,
    );
  let text = typeof raw === "string" ? raw : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

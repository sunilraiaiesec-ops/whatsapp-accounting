"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

// Reasonable default for BantooBooks' primary market — editable via the
// dropdown, just saves a click for the common case.
const DEFAULT_COUNTRY: CountryCode = "CM";

type CountryOption = { code: CountryCode; name: string; callingCode: string };

// Locale-independent, identical on server and client — the server snapshot
// for useCountryOptions below, computed once at module load.
function buildCodeOnlyOptions(): CountryOption[] {
  return getCountries()
    .map((code) => ({ code, name: code, callingCode: getCountryCallingCode(code) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
const CODE_ONLY_OPTIONS = buildCodeOnlyOptions();

// Intl.DisplayNames output isn't guaranteed identical between Node's
// server-side ICU and a browser's ICU (confirmed in practice: some regions,
// e.g. Falkland Islands, render differently) — computing this during SSR
// causes a hydration mismatch. Cached per locale (useSyncExternalStore
// requires a stable reference per snapshot, same reasoning as
// AppShell.tsx's useHoverCapable) and only ever read on the client.
const localizedOptionsCache = new Map<string, CountryOption[]>();
function getLocalizedCountryOptions(locale: string): CountryOption[] {
  let cached = localizedOptionsCache.get(locale);
  if (!cached) {
    const displayNames = new Intl.DisplayNames([locale === "fr" ? "fr" : "en"], { type: "region" });
    cached = getCountries()
      .map((code) => ({
        code,
        name: displayNames.of(code) ?? code,
        callingCode: getCountryCallingCode(code),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    localizedOptionsCache.set(locale, cached);
  }
  return cached;
}

// Nothing external ever invalidates this snapshot (locale changes go
// through next-intl's own re-render, not a subscribable event source), so
// subscribe is a stable no-op — useSyncExternalStore's contract just wants a
// referentially-stable function, which a module-scope one satisfies for free.
function subscribeNever() {
  return () => {};
}

function useCountryOptions(locale: string): CountryOption[] {
  return useSyncExternalStore(
    subscribeNever,
    () => getLocalizedCountryOptions(locale),
    () => CODE_ONLY_OPTIONS,
  );
}

export function PhoneField({
  label,
  name,
  required = true,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  required?: boolean;
  // An existing E.164 value to prefill (edit flows) — parsed back into
  // country + national number on mount.
  defaultValue?: string;
  hint?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("common");
  const countries = useCountryOptions(locale);

  const parsedDefault = defaultValue ? parsePhoneNumberFromString(defaultValue) : undefined;
  const [country, setCountry] = useState<CountryCode>(parsedDefault?.country ?? DEFAULT_COUNTRY);
  const [national, setNational] = useState(parsedDefault?.nationalNumber ?? "");

  const parsed = national.trim() ? parsePhoneNumberFromString(national, country) : undefined;
  const e164 = parsed?.isValid() ? parsed.number : "";
  const showInvalid = national.trim().length > 0 && !e164;

  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1 flex gap-2">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value as CountryCode)}
          aria-label={t("country")}
          // Inline style, not a Tailwind width utility: .input-modern sets
          // its own width and — being an unlayered custom class — wins the
          // cascade over utilities like w-[9.5rem] regardless of source
          // order, so a utility-class width silently never applies here.
          style={{ width: "9.5rem", flexShrink: 0 }}
          className="input-modern"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} (+{c.callingCode})
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          value={national}
          onChange={(e) => setNational(e.target.value)}
          required={required}
          className="input-modern flex-1"
        />
      </div>
      {showInvalid ? (
        <span className="mt-1 block text-xs text-red-600">{t("invalidPhoneNumber")}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : null}
      {/* The form only ever submits the normalized E.164 value — country +
          national-number are purely a data-entry aid. */}
      <input type="hidden" name={name} value={e164} />
    </label>
  );
}

// Localized "x days ago" / "in x days" relative to today, from a date.
export function relativeDays(date: Date, locale: string): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diff = Math.round((a - b) / dayMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diff) >= 365) return rtf.format(Math.round(diff / 365), "year");
  if (Math.abs(diff) >= 30) return rtf.format(Math.round(diff / 30), "month");
  return rtf.format(diff, "day");
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

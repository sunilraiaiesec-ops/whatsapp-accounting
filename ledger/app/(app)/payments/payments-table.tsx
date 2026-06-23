"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

export type PaymentRow = {
  id: string;
  number: string;
  date: string; // YYYY-MM-DD
  party: string;
  from: string;
  amount: string; // pre-formatted, no currency suffix
};

type Period = "all" | "month" | "30d" | "year" | "custom";

function inPeriod(dateStr: string, period: Period, from: string, to: string): boolean {
  if (period === "all") return true;
  if (period === "custom") {
    // date strings are YYYY-MM-DD, so lexical comparison is chronological
    if (from && dateStr < from) return false;
    if (to && dateStr > to) return false;
    return true;
  }
  const d = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  if (period === "month") {
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  }
  if (period === "year") {
    return d.getUTCFullYear() === now.getUTCFullYear();
  }
  // last 30 days
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  return d >= cutoff;
}

export default function PaymentsTable({
  rows,
  currency,
}: {
  rows: PaymentRow[];
  currency: string;
}) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const [period, setPeriod] = useState<Period>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const periodLabels: Record<Period, string> = {
    all: t("periodAll"),
    month: t("periodMonth"),
    "30d": t("period30d"),
    year: t("periodYear"),
    custom: t("periodCustom"),
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!inPeriod(r.date, period, customFrom, customTo)) return false;
      if (!q) return true;
      return (
        r.number.toLowerCase().includes(q) ||
        r.party.toLowerCase().includes(q) ||
        r.from.toLowerCase().includes(q)
      );
    });
  }, [rows, period, query, customFrom, customTo]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label={t("customFrom")}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand)]"
            />
            <span className="text-sm text-[var(--muted)]">{t("customTo")}</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label={t("customTo")}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand)]"
            />
          </div>
        )}
        <div className="relative">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="appearance-none rounded-full border border-[var(--border)] bg-white py-2 pr-9 pl-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-[var(--brand)]"
            aria-label={t("periodLabel")}
          >
            {(["all", "month", "30d", "year", "custom"] as Period[]).map((p) => (
              <option key={p} value={p}>
                {periodLabels[p]}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.25 4.41a.75.75 0 01-1.08 0l-4.25-4.41a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition ${
            showFilters
              ? "border-[var(--brand)] bg-[var(--brand)]/5 text-[var(--brand)]"
              : "border-[var(--border)] bg-white text-slate-700 hover:border-slate-300"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M2.5 4.25A.75.75 0 013.25 3.5h13.5a.75.75 0 01.6 1.2l-5.1 6.8v4.05a.75.75 0 01-1.13.65l-2.5-1.45a.75.75 0 01-.37-.65v-2.6L2.65 4.95a.75.75 0 01-.15-.7z" />
          </svg>
          {t("filters")}
        </button>
      </div>

      {showFilters && (
        <div className="mb-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="input-modern max-w-md"
          />
        </div>
      )}

      <div className="card-surface overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t("empty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">{t("number")}</th>
                <th className="px-4 py-3 font-medium">{t("dateColumn")}</th>
                <th className="px-4 py-3 font-medium">{t("paidTo")}</th>
                <th className="px-4 py-3 font-medium">{t("from")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/payments/${r.id}`} className="font-medium text-[var(--brand)] hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.date}</td>
                  <td className="px-4 py-3 text-slate-700">{r.party}</td>
                  <td className="px-4 py-3 text-slate-600">{r.from}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                    {r.amount} <span className="text-slate-400">{currency}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">
        {tc("showing", { count: filtered.length, total: rows.length })}
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/ui/StatusBadge";

export type ColumnKind = "link" | "amount" | "status" | "muted" | "mono" | "text";

export type Column = {
  key: string;
  header: string;
  align?: "right";
  kind?: ColumnKind;
  mono?: boolean;
};

export type ListRow = { id: string; href?: string; _date?: string } & Record<string, string>;

type Period = "all" | "month" | "30d" | "year" | "custom";

function inPeriod(dateStr: string | undefined, period: Period, from: string, to: string): boolean {
  if (period === "all" || !dateStr) return true;
  if (period === "custom") {
    if (from && dateStr < from) return false;
    if (to && dateStr > to) return false;
    return true;
  }
  const d = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  if (period === "month") {
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  }
  if (period === "year") return d.getUTCFullYear() === now.getUTCFullYear();
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  return d >= cutoff;
}

export function ListView({
  rows,
  columns,
  currency,
  searchKeys,
  hasDateFilter = false,
  emptyText,
  searchPlaceholder,
  mobile,
}: {
  rows: ListRow[];
  columns: Column[];
  currency: string;
  searchKeys: string[];
  hasDateFilter?: boolean;
  emptyText: string;
  searchPlaceholder?: string;
  mobile?: { title: string; subtitle?: string; amount?: string; status?: string };
}) {
  const t = useTranslations("common");
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
      if (hasDateFilter && !inPeriod(r._date, period, customFrom, customTo)) return false;
      if (!q) return true;
      return searchKeys.some((k) => (r[k] ?? "").toLowerCase().includes(q));
    });
  }, [rows, period, query, customFrom, customTo, hasDateFilter, searchKeys]);

  function cell(row: ListRow, col: Column) {
    const value = row[col.key] ?? "—";
    switch (col.kind) {
      case "link":
        return (
          <Link href={row.href ?? "#"} className="font-medium text-[var(--brand)] hover:underline">
            {value}
          </Link>
        );
      case "amount":
        return (
          <>
            {value} <span className="font-normal text-slate-400">{currency}</span>
          </>
        );
      case "status":
        return <StatusBadge status={value} />;
      default:
        return value;
    }
  }

  const cellClass = (col: Column) => {
    const base = "px-5 py-3";
    const align = col.align === "right" ? " text-right tabular-nums" : "";
    const isMono = col.mono ?? (col.kind === "link" || col.kind === "mono");
    if (isMono) return `${base} font-mono text-xs`;
    if (col.kind === "muted") return `${base} text-slate-600${align}`;
    if (col.kind === "amount") return `${base} font-semibold text-slate-900${align}`;
    return `${base} text-slate-700${align}`;
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {hasDateFilter && period === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label={t("rangeFrom")}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand)]"
            />
            <span className="text-sm text-[var(--muted)]">{t("rangeTo")}</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label={t("rangeTo")}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand)]"
            />
          </div>
        )}
        {hasDateFilter && (
          <div className="relative">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="appearance-none rounded-full border border-[var(--border)] bg-white py-2 pr-9 pl-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-[var(--brand)]"
              aria-label={t("dateRange")}
            >
              {(["all", "month", "30d", "year", "custom"] as Period[]).map((p) => (
                <option key={p} value={p}>
                  {periodLabels[p]}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.25 4.41a.75.75 0 01-1.08 0l-4.25-4.41a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        )}
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
            placeholder={searchPlaceholder ?? t("search")}
            className="input-modern max-w-md"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card-surface p-8 text-center text-sm text-[var(--muted)]">{emptyText}</div>
      ) : (
        <>
          {mobile && (
            <div className="space-y-3 md:hidden">
              {filtered.map((r) => (
                <Link key={r.id} href={r.href ?? "#"} className="card-surface block p-4 transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{r[mobile.title]}</p>
                      {mobile.subtitle ? (
                        <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">{r[mobile.subtitle]}</p>
                      ) : null}
                    </div>
                    {mobile.status ? <StatusBadge status={r[mobile.status]} /> : null}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <p className="text-xs text-[var(--muted)]">{r._date}</p>
                    {mobile.amount ? (
                      <p className="text-lg font-bold tabular-nums text-slate-900">
                        {r[mobile.amount]} <span className="text-sm font-normal text-slate-400">{currency}</span>
                      </p>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className={`card-surface overflow-hidden ${mobile ? "hidden md:block" : ""}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {columns.map((c) => (
                      <th key={c.key} className={`px-5 py-3 ${c.align === "right" ? "text-right" : ""}`}>
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/80">
                      {columns.map((c) => (
                        <td key={c.key} className={cellClass(c)}>
                          {cell(r, c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p className="mt-3 text-xs text-[var(--muted)]">
        {t("showing", { count: filtered.length, total: rows.length })}
      </p>
    </div>
  );
}

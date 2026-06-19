"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { globalSearch, type SearchResult, type SearchResultType } from "@/app/actions/search";

const TYPE_LABEL_KEY: Record<SearchResultType, string> = {
  customer: "customers",
  supplier: "suppliers",
  salesInvoice: "salesInvoices",
  purchaseInvoice: "purchaseInvoices",
  receipt: "receipts",
  payment: "payments",
};

export function GlobalSearch() {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) return;

    let cancelled = false;
    const handle = window.setTimeout(() => {
      globalSearch(q)
        .then((res) => {
          if (cancelled) return;
          setResults(res);
          setActive(0);
          setOpen(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  function onChange(value: string) {
    setQuery(value);
    if (value.trim().length < 1) {
      setResults([]);
      setLoading(false);
      setOpen(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function go(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (value + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (value - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[active];
      if (target) go(target);
    }
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div className="relative" ref={containerRef}>
      <label className="relative block">
        <span className="sr-only">{t("search")}</span>
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-400"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3-3" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("searchPlaceholder")}
          className="input-search"
          autoComplete="off"
        />
      </label>

      {showDropdown ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">{tc("loading")}</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">{tc("noResults")}</p>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto py-1">
              {results.map((result, index) => (
                <li key={`${result.type}:${result.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(result)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition ${
                      index === active ? "bg-[var(--brand)]/10" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">
                        {result.label}
                      </span>
                      {result.sublabel ? (
                        <span className="block truncate text-xs text-[var(--muted)]">
                          {result.sublabel}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {t(TYPE_LABEL_KEY[result.type])}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { BantooOption } from "@/lib/bantoo/types";

const inputClass = "input-modern text-base md:text-sm";

export type BantooComboboxProps = {
  label: string;
  // Free-text the user typed / the resolved name. This is the source of truth
  // for "create new" and is kept in the draft.
  text: string;
  // Currently selected existing-record id (null = free text / create new).
  selectedId: string | null;
  // Initial candidates from the proposal (already ranked, with score/bucket).
  options: BantooOption[];
  // Debounced remote search as the user types (org-scoped server action).
  onSearch?: (query: string) => Promise<BantooOption[]>;
  // Called when the user picks an existing record.
  onSelectExisting: (option: BantooOption) => void;
  // Called as the user edits the free text (clears any selection upstream).
  onTextChange: (text: string) => void;
  allowCreate?: boolean;
  createLabel?: (text: string) => string;
  placeholder?: string;
};

// A lightweight searchable dropdown (combobox) styled to match BantooBooks.
// - Pre-selects/highlights the best match when confidence is high/medium.
// - Lists other candidates + a "Create new …" row (when allowed).
// - Debounces typing and queries the org-scoped search endpoint.
// - 44px touch targets, mobile bottom-sheet friendly.
export function BantooCombobox({
  label,
  text,
  selectedId,
  options,
  onSearch,
  onSelectExisting,
  onTextChange,
  allowCreate = true,
  createLabel,
  placeholder,
}: BantooComboboxProps) {
  const t = useTranslations("command");
  const listId = useId();
  const [open, setOpen] = useState(false);
  // Live search results (null = none yet; fall back to the proposal `options`).
  const [searchResults, setSearchResults] = useState<BantooOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  // Reset live results when the proposal is (re)hydrated with new options —
  // done during render (React's recommended pattern) rather than in an effect.
  const [prevOptions, setPrevOptions] = useState(options);
  if (prevOptions !== options) {
    setPrevOptions(options);
    setSearchResults(null);
  }
  const candidates = searchResults ?? options;

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function runSearch(query: string) {
    if (!onSearch) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const seq = (searchSeq.current += 1);
      setLoading(true);
      try {
        const next = await onSearch(query);
        // Ignore stale responses that resolved out of order.
        if (seq === searchSeq.current) setSearchResults(next);
      } catch {
        /* keep prior candidates on error */
      } finally {
        if (seq === searchSeq.current) setLoading(false);
      }
    }, 220);
  }

  const trimmed = text.trim();
  const showCreate =
    allowCreate &&
    trimmed.length >= 2 &&
    !candidates.some((c) => c.label.toLowerCase() === trimmed.toLowerCase());

  const selected = selectedId ? candidates.find((c) => c.id === selectedId) : undefined;

  return (
    <div className="block text-sm" ref={rootRef}>
      <span className="font-medium text-slate-700">{label}</span>
      <div className="relative mt-1">
        <input
          type="text"
          value={text}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value;
            onTextChange(v);
            setOpen(true);
            runSearch(v);
          }}
          onFocus={() => {
            setOpen(true);
            if (candidates.length === 0 && onSearch) runSearch(text);
          }}
          className={`${inputClass} ${selectedId ? "border-[var(--brand)]/50" : ""}`}
        />
        {selectedId ? (
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand)]"
          >
            ✓
          </span>
        ) : null}

        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg"
          >
            {loading ? (
              <li className="px-3 py-2 text-sm text-[var(--muted)]">{t("searching")}</li>
            ) : null}
            {candidates.map((c, i) => {
              const isSelected = c.id === selectedId;
              const isBest = i === 0 && (c.bucket === "high" || c.bucket === "medium");
              return (
                <li key={c.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectExisting(c);
                      setOpen(false);
                    }}
                    className={`flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      isSelected ? "bg-[var(--brand)]/5" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      {isBest ? <span aria-hidden className="mr-1 text-[var(--brand)]">✓</span> : null}
                      <span className={isBest ? "font-semibold text-slate-900" : "text-slate-700"}>
                        {c.label}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {isBest ? (
                        <span className="rounded-full bg-[var(--brand)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--brand)]">
                          {t("bestMatch")}
                        </span>
                      ) : null}
                      {typeof c.score === "number" && c.score > 0 ? (
                        <span className="text-xs text-[var(--muted)]">{c.score}%</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
            {candidates.length === 0 && !loading ? (
              <li className="px-3 py-2 text-sm text-[var(--muted)]">{t("noMatches")}</li>
            ) : null}
            {showCreate ? (
              <li role="option" aria-selected={!selectedId} className="border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => {
                    // Clearing the selection upstream marks this as "create new".
                    onTextChange(trimmed);
                    onSelectExisting({ id: "", label: trimmed });
                    setOpen(false);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand)]/5"
                >
                  ➕ {createLabel ? createLabel(trimmed) : t("createNew", { name: trimmed })}
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {selected ? (
        <p className="mt-1 text-xs text-[var(--brand)]">{t("usingExisting", { name: selected.label })}</p>
      ) : trimmed && !selectedId && allowCreate ? (
        <p className="mt-1 text-xs text-[var(--muted)]">{t("willCreateNew", { name: trimmed })}</p>
      ) : null}
    </div>
  );
}

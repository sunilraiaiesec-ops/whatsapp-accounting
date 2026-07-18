"use client";

import { useEffect, useRef, useState } from "react";

function CalendarIcon() {
  return (
    <svg
      className="pointer-events-none shrink-0 text-slate-400"
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <rect x="3" y="4.5" width="14" height="12" rx="1.6" />
      <path d="M3 8h14M6.5 2.5v3M13.5 2.5v3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d={direction === "left" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Sunday-first 6x7 grid (42 cells) covering the full month plus leading/
// trailing days from adjacent months, so the grid height never jumps
// between months.
function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = monthStart.getDay();
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export type DatePickerProps = {
  name: string;
  value: string; // "" or YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  displayLocale?: string;
};

// A real calendar dropdown (month grid, month navigation, keyboard/
// click-outside dismissal) instead of the native <input type="date"> —
// consistent styling across every browser, instead of relying on each
// browser's own picker chrome and locale-formatted placeholder text.
// Still submits as a plain YYYY-MM-DD form value (a hidden input), so no
// server-side parsing changes anywhere this replaces the native input.
export function DatePicker({ name, value, onChange, placeholder = "Select date", displayLocale = "en-US" }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISODate(value) : null;
  const [viewMonth, setViewMonth] = useState(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openPicker() {
    const base = selected ?? new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setOpen(true);
  }

  const days = buildMonthGrid(viewMonth);
  const monthLabel = viewMonth.toLocaleDateString(displayLocale, { month: "long", year: "numeric" });
  const displayValue = selected
    ? selected.toLocaleDateString(displayLocale, { year: "numeric", month: "short", day: "numeric" })
    : "";

  return (
    <div className="relative" ref={rootRef}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="input-date flex w-full items-center justify-between text-left"
      >
        <span className={displayValue ? "text-slate-900" : "text-slate-400"}>
          {displayValue || placeholder}
        </span>
        <CalendarIcon />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute z-20 mt-1 w-72 rounded-lg border border-[var(--border)] bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100"
            >
              <ChevronIcon direction="left" />
            </button>
            <span className="text-sm font-semibold text-slate-800">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center text-xs font-medium text-slate-400">
            {WEEKDAY_LABELS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {days.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const isSelected = selected ? isSameDay(d, selected) : false;
              const isToday = isSameDay(d, new Date());
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange(toISODate(d));
                    setOpen(false);
                  }}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md text-sm transition ${
                    isSelected
                      ? "bg-[var(--brand)] font-semibold text-white"
                      : inMonth
                        ? "text-slate-700 hover:bg-slate-100"
                        : "text-slate-300 hover:bg-slate-50"
                  } ${isToday && !isSelected ? "ring-1 ring-inset ring-[var(--brand)]/40" : ""}`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(toISODate(new Date()));
                setOpen(false);
              }}
              className="text-xs font-semibold text-[var(--brand)] hover:underline"
            >
              Today
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs font-medium text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";

type CloneAction = (formData: FormData) => void | Promise<void>;

export function DocToolbar({
  listHref,
  listLabel,
  id,
  editHref,
  cloneAction,
  prevHref,
  nextHref,
  index,
  total,
}: {
  listHref: string;
  listLabel: string;
  id: string;
  editHref?: string;
  cloneAction: CloneAction;
  prevHref: string | null;
  nextHref: string | null;
  index: number;
  total: number;
}) {
  const btn =
    "inline-flex items-center rounded-full border border-[var(--border)] bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50";

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={listHref} className={btn}>
          ← {listLabel}
        </Link>
        {editHref ? (
          <Link href={editHref} className={`${btn} border-[var(--brand)]/30 text-[var(--brand)]`}>
            Edit
          </Link>
        ) : (
          <button type="button" className={`${btn} opacity-40`} disabled title="Coming soon">
            Edit
          </button>
        )}
        <form action={cloneAction}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={btn}>
            Clone
          </button>
        </form>
        <button type="button" onClick={() => window.print()} className={btn}>
          Print
        </button>
        <button type="button" onClick={() => window.print()} className={btn}>
          PDF
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
        {prevHref ? (
          <Link href={prevHref} className={btn}>
            ‹ Prev
          </Link>
        ) : (
          <span className={`${btn} opacity-40`}>‹ Prev</span>
        )}
        <span className="rounded-full bg-slate-100 px-3 py-1 tabular-nums text-slate-600">
          {index} / {total}
        </span>
        {nextHref ? (
          <Link href={nextHref} className={btn}>
            Next ›
          </Link>
        ) : (
          <span className={`${btn} opacity-40`}>Next ›</span>
        )}
      </div>
    </div>
  );
}

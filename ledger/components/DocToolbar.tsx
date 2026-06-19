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
    "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={listHref} className={btn}>
          ← {listLabel}
        </Link>
        {editHref ? (
          <Link href={editHref} className={btn}>
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

      <div className="flex items-center gap-2 text-sm text-slate-500">
        {prevHref ? (
          <Link href={prevHref} className={btn}>
            ‹ Prev
          </Link>
        ) : (
          <span className={`${btn} opacity-40`}>‹ Prev</span>
        )}
        <span className="tabular-nums">
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

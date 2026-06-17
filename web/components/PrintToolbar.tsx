"use client";

import Link from "next/link";

export function PrintToolbar({ invoiceId }: { invoiceId: string }) {
  return (
    <div className="mx-auto mb-4 flex max-w-3xl gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
      >
        Print / Save PDF
      </button>
      <Link
        href={`/invoices/${invoiceId}`}
        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
      >
        Back
      </Link>
    </div>
  );
}

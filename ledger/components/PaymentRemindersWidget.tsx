import Link from "next/link";

import { formatAmount, formatMoney } from "@/lib/money";
import { resolveContactWhatsAppNumber } from "@/lib/phone";
import { buildPaymentReminderMessage, buildWhatsAppLink } from "@/lib/billing/reminders";

// ---------------------------------------------------------------------------
// Compact dashboard section for due-soon / overdue sales invoices — visual
// style mirrors the existing low-stock amber banner in the dashboard page.
// Plain hardcoded English strings (no next-intl) to avoid touching the
// shared messages/*.json files owned by another in-flight task.
//
// Every "Send reminder" link is a plain wa.me href built from a pure message
// template — clicking it opens WhatsApp with a pre-filled draft; nothing is
// ever sent automatically from this component or any code it calls.
// ---------------------------------------------------------------------------

export type PaymentReminderInvoiceVM = {
  id: string;
  number: string;
  total: bigint;
  // Nullable to match the underlying SalesInvoice field type directly (the
  // query this widget is fed from already filters to dueDate != null) —
  // any item without one is defensively skipped rather than crashing.
  dueDate: Date | null;
  party: { name: string; phone: string | null; whatsapp: string | null };
};

export type PaymentRemindersWidgetProps = {
  dueSoon: PaymentReminderInvoiceVM[];
  overdue: PaymentReminderInvoiceVM[];
  currency: string;
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function PaymentRemindersWidget({ dueSoon, overdue, currency }: PaymentRemindersWidgetProps) {
  const total = dueSoon.length + overdue.length;
  if (total === 0) return null;

  const rows = [
    ...overdue.map((invoice) => ({ invoice, bucket: "overdue" as const })),
    ...dueSoon.map((invoice) => ({ invoice, bucket: "dueSoon" as const })),
  ];

  return (
    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-amber-800">
          <span aria-hidden>💳</span>
          {total} payment {total === 1 ? "reminder" : "reminders"}
          {overdue.length > 0 ? ` (${overdue.length} overdue)` : ""}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {rows.map(({ invoice, bucket }) => {
          if (!invoice.dueDate) return null; // defensive — the source query always sets this
          const dueDate = invoice.dueDate;
          const phoneDigits = resolveContactWhatsAppNumber({
            phone: invoice.party.phone,
            whatsapp: invoice.party.whatsapp,
          });
          const message = buildPaymentReminderMessage({
            customerName: invoice.party.name,
            invoiceNumber: invoice.number,
            amount: formatAmount(invoice.total, currency),
            currency,
            dueDate: formatDate(dueDate),
          });
          const waLink = phoneDigits ? buildWhatsAppLink(phoneDigits, message) : null;

          return (
            <li
              key={invoice.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {invoice.party.name} — {invoice.number}
                </p>
                <p className="text-xs text-slate-500">
                  {formatMoney(invoice.total, currency)} · due {formatDate(dueDate)}
                  {bucket === "overdue" ? (
                    <span className="ml-1 font-semibold text-amber-700">· overdue</span>
                  ) : null}
                </p>
              </div>
              {waLink ? (
                <Link
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-semibold text-amber-700 hover:underline"
                >
                  Send reminder →
                </Link>
              ) : (
                <span className="shrink-0 text-xs text-slate-400">No phone on file</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

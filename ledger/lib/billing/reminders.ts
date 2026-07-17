import type { SalesInvoice, Party } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildWhatsAppLink } from "@/lib/reorder-message";

// ---------------------------------------------------------------------------
// Payment reminders foundation — surfaces sales invoices that are due soon
// or overdue so a user can send a polite WhatsApp nudge (draft-only, never
// auto-sent — see buildPaymentReminderMessage below).
//
// Eligibility is driven by SalesInvoice.status: UNPAID and PARTIALLY_PAID
// are reminder-eligible (a partial payment doesn't retire the reminder, just
// reduces what's still owed — see lib/invoice-lifecycle.ts#applyReceiptAllocations
// for how amountPaid/status are kept in sync); DRAFT, PAID, and VOIDED are
// excluded.
// ---------------------------------------------------------------------------

export type SalesInvoiceWithParty = SalesInvoice & { party: Party };

export type DueSoonAndOverdue = {
  dueSoon: SalesInvoiceWithParty[];
  overdue: SalesInvoiceWithParty[];
};

// Truncates to a UTC calendar date (midnight), matching how @db.Date columns
// are stored, so day-boundary comparisons aren't skewed by time-of-day.
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Org-scoped query over outstanding invoices with a due date, bucketed into
// "due soon" (due today through `dueSoonWindowDays` from now) and "overdue"
// (due date already in the past). `now` is injectable for deterministic
// tests — defaults to the real clock.
export async function getDueSoonAndOverdueInvoices(
  orgId: string,
  dueSoonWindowDays = 7,
  now: Date = new Date(),
): Promise<DueSoonAndOverdue> {
  const today = startOfUtcDay(now);
  const windowEnd = new Date(today.getTime() + dueSoonWindowDays * 86_400_000);

  const invoices = (await prisma.salesInvoice.findMany({
    where: {
      orgId,
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
      dueDate: { not: null },
    },
    include: { party: true },
    orderBy: { dueDate: "asc" },
  })) as SalesInvoiceWithParty[];

  const dueSoon: SalesInvoiceWithParty[] = [];
  const overdue: SalesInvoiceWithParty[] = [];

  for (const invoice of invoices) {
    if (!invoice.dueDate) continue;
    const dueDate = startOfUtcDay(invoice.dueDate);
    if (dueDate.getTime() < today.getTime()) {
      overdue.push(invoice);
    } else if (dueDate.getTime() <= windowEnd.getTime()) {
      dueSoon.push(invoice);
    }
  }

  return { dueSoon, overdue };
}

// Lightweight count for a notification-center badge — same bucketing logic,
// just the totals.
export async function getPaymentReminderCount(
  orgId: string,
  dueSoonWindowDays = 7,
  now: Date = new Date(),
): Promise<number> {
  const { dueSoon, overdue } = await getDueSoonAndOverdueInvoices(orgId, dueSoonWindowDays, now);
  return dueSoon.length + overdue.length;
}

export type PaymentReminderMessageInput = {
  customerName: string;
  invoiceNumber: string;
  /** Pre-formatted amount string (e.g. from formatMoney) — kept currency-agnostic. */
  amount: string;
  currency: string;
  /** Pre-formatted due date string, ready to drop straight into the message. */
  dueDate: string;
};

// Phrases that must never appear in a payment reminder — enforced by
// reminders.test.ts. Mirrors the spirit of FORBIDDEN_PHRASES in
// lib/reorder-message.ts: polite, no urgency/pressure language, since this
// is a relationship-preserving nudge, not a collections notice.
export const FORBIDDEN_PHRASES: readonly string[] = [
  "overdue",
  "late",
  "immediately",
  "please pay now",
  "urgent",
  "past due",
  "final notice",
];

function cleanLine(value: string): string {
  return value.trim();
}

// PURE function (no Prisma/server imports) so it can be imported from client
// components as well as server code, just like buildSupplierQuoteMessage.
// Never sends anything itself — the caller wraps the result with
// buildWhatsAppLink() (re-exported below) to build a wa.me draft link that
// the user must click "Send" on inside WhatsApp themselves.
export function buildPaymentReminderMessage(input: PaymentReminderMessageInput): string {
  const customerName = cleanLine(input.customerName) || "there";
  const invoiceNumber = cleanLine(input.invoiceNumber) || "your invoice";
  const amount = cleanLine(input.amount);
  const currency = cleanLine(input.currency).toUpperCase();
  const dueDate = cleanLine(input.dueDate);
  const amountPhrase = currency ? `${amount} ${currency}` : amount;

  return [
    `Hello ${customerName},`,
    `This is a friendly reminder about invoice ${invoiceNumber} for ${amountPhrase}, due on ${dueDate}.`,
    "",
    "Kindly let us know if you have any questions, or if a payment is already on its way.",
    "",
    "Thank you for your business.",
  ].join("\n");
}

// Re-exported (not duplicated) from lib/reorder-message.ts — the one
// "click-to-chat" transport function shared by every WhatsApp draft flow in
// the app.
export { buildWhatsAppLink };

"use client";

import { useTranslations } from "next-intl";

// Accepts the invoice lifecycle's 5 statuses (DRAFT/UNPAID/PARTIALLY_PAID/
// PAID/VOIDED, case-insensitive) plus the legacy "paid"/"unpaid" strings
// still present on rows built before the migration, and every other
// document-status string the app renders through this shared badge falls
// back to the plain unpaid/amber styling it always had.
export function StatusBadge({
  status,
  dueDate,
}: {
  status: string;
  // ISO date string or Date — when provided, an UNPAID/PARTIALLY_PAID status
  // past this date renders as "Overdue" instead of its normal label. Not a
  // stored status (see prisma/schema.prisma's InvoiceStatus enum comment).
  dueDate?: string | Date | null;
}) {
  const t = useTranslations("common");
  const normalized = status.toUpperCase();

  const overdue =
    (normalized === "UNPAID" || normalized === "PARTIALLY_PAID") &&
    dueDate != null &&
    new Date(dueDate) < new Date(new Date().toDateString());

  const label = overdue
    ? t("overdue")
    : normalized === "PAID"
      ? t("paid")
      : normalized === "DRAFT"
        ? t("draft")
        : normalized === "PARTIALLY_PAID"
          ? t("partiallyPaid")
          : normalized === "VOIDED"
            ? t("voided")
            : t("unpaid");

  const tone = overdue
    ? "bg-red-100 text-red-800"
    : normalized === "PAID"
      ? "bg-[var(--brand)]/10 text-[var(--brand)]"
      : normalized === "DRAFT"
        ? "bg-slate-100 text-slate-500"
        : normalized === "PARTIALLY_PAID"
          ? "bg-blue-100 text-blue-800"
          : normalized === "VOIDED"
            ? "bg-slate-200 text-slate-500 line-through"
            : "bg-amber-100 text-amber-800";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${tone}`}
    >
      {label}
    </span>
  );
}

"use client";

import { useTranslations } from "next-intl";

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("common");
  const paid = status.toLowerCase() === "paid";
  const label = paid ? t("paid") : t("unpaid");

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
        paid
          ? "bg-[var(--brand)]/10 text-[var(--brand)]"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {label}
    </span>
  );
}

import { getTranslations } from "next-intl/server";

import { PENDING_TRANSACTION_TYPE_LABELS, type PendingTransactionType } from "@/lib/approvals/types";

export type SubmissionNoticeVM = {
  id: string;
  type: PendingTransactionType;
  status: "rejected" | "needs_correction";
  rejectionReason: string | null;
};

// §11 "the submitting user should see it — a simple in-app flag on their
// next relevant view is enough". Server-rendered (no interaction needed);
// pairs with lib/approvals/engine.ts#listMySubmissionNotices, which is
// already scoped to `orgId` AND `submittedById`.
export async function MySubmissionNotices({ items }: { items: SubmissionNoticeVM[] }) {
  if (items.length === 0) return null;
  const t = await getTranslations("approvals");

  return (
    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-800">{t("correctionNoticeTitle")}</p>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="text-sm text-amber-900">
            <span className="font-medium">{PENDING_TRANSACTION_TYPE_LABELS[item.type]}:</span>{" "}
            {t(item.status === "rejected" ? "rejectedNotice" : "needsCorrectionNotice", {
              reason: item.rejectionReason ?? "",
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

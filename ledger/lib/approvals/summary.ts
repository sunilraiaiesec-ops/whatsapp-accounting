import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { formatAmount } from "@/lib/money";
import { descriptionFromStored, estimateAmountMinorFromStored, partyIdFromStored } from "@/lib/approvals/payloads";
import { PENDING_TRANSACTION_TYPE_LABELS, type PendingTransactionType, type RiskReview } from "@/lib/approvals/types";

export type PendingApprovalSummary = {
  id: string;
  type: PendingTransactionType;
  typeLabel: string;
  amountLabel: string;
  partyName: string | null;
  description: string | null;
  submittedByName: string;
  submittedAt: Date;
  aiConfidence: number | null;
  aiRiskReview: RiskReview | null;
  hasAttachment: boolean;
};

// Shapes a page of PendingTransaction rows (as returned by
// lib/approvals/engine.ts#listPendingApprovals, which already includes
// `submittedBy`) into display-ready summaries for the dashboard widget,
// resolving party names in one batched query rather than N+1.
export async function summarizePendingApprovals(
  orgId: string,
  currency: string,
  rows: {
    id: string;
    type: PendingTransactionType;
    payload: Prisma.JsonValue;
    submittedAt: Date;
    aiConfidence: number | null;
    aiRiskReview: Prisma.JsonValue;
    attachmentId: string | null;
    submittedBy: { name: string };
  }[],
): Promise<PendingApprovalSummary[]> {
  const partyIds = [...new Set(rows.map((r) => partyIdFromStored(r.type, r.payload)).filter((id): id is string => !!id))];
  const parties = partyIds.length
    ? await prisma.party.findMany({ where: { orgId, id: { in: partyIds } }, select: { id: true, name: true } })
    : [];
  const partyById = new Map(parties.map((p) => [p.id, p.name]));

  return rows.map((row) => {
    const partyId = partyIdFromStored(row.type, row.payload);
    const amount = estimateAmountMinorFromStored(row.type, row.payload);
    return {
      id: row.id,
      type: row.type,
      typeLabel: PENDING_TRANSACTION_TYPE_LABELS[row.type],
      amountLabel: amount > 0n ? `${formatAmount(amount, currency)} ${currency}` : "—",
      partyName: partyId ? partyById.get(partyId) ?? null : null,
      description: descriptionFromStored(row.type, row.payload),
      submittedByName: row.submittedBy.name,
      submittedAt: row.submittedAt,
      aiConfidence: row.aiConfidence,
      aiRiskReview: (row.aiRiskReview as unknown as RiskReview | null) ?? null,
      hasAttachment: row.attachmentId != null,
    };
  });
}

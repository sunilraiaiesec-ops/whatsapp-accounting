import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { postApprovedPayload, serializeForType } from "@/lib/approvals/payloads";
import { computeRiskReview } from "@/lib/approvals/risk-review";
import { ApprovalError, ApprovalForbiddenError, type PendingTransactionType } from "@/lib/approvals/types";

// ---------------------------------------------------------------------------
// §11 approval engine. Every function here is the SAME layer both the UI
// server actions (app/actions/approvals.ts) AND tests call — there is no
// separate "real" enforcement path hidden in the UI. In particular:
//   - approvePendingTransaction / rejectPendingTransaction / editThenApprove /
//     requestCorrection all re-check permission server-side from `ctx.role`
//     (never a client-supplied flag) and re-scope every query by `ctx.orgId`
//     (never trusting a bare `id`) — see the Security section of the report.
// ---------------------------------------------------------------------------

type ApprovalActor = { orgId: string; userId: string; role: string };

export type SubmitForApprovalInput = {
  orgId: string;
  submittedById: string;
  type: PendingTransactionType;
  // The RAW payload (Dates/BigInts), exactly as it would have been passed to
  // the real posting function — this function serializes it.
  rawPayload: unknown;
  // The org's base currency — needed so the risk review's price-increase
  // signal compares minor-unit amounts correctly for non-zero-decimal
  // currencies (see lib/approvals/risk-review.ts).
  baseCurrency: string;
  attachmentId?: string | null;
  aiConfidence?: number | null;
};

// Creates a PendingTransaction draft. Never touches the ledger/inventory —
// the real posting function is only ever called from approvePendingTransaction
// / editThenApprove.
export async function submitForApproval(input: SubmitForApprovalInput) {
  const payload = serializeForType(input.type, input.rawPayload);
  const risk = await computeRiskReview(
    input.orgId,
    input.type,
    payload as unknown as Prisma.JsonValue,
    input.attachmentId ?? null,
    input.baseCurrency,
  );

  return prisma.pendingTransaction.create({
    data: {
      orgId: input.orgId,
      type: input.type,
      payload,
      submittedById: input.submittedById,
      status: "pending",
      attachmentId: input.attachmentId ?? null,
      aiConfidence: input.aiConfidence ?? null,
      aiRiskReview: risk as unknown as Prisma.InputJsonValue,
    },
  });
}

async function loadOwnedPending(orgId: string, id: string) {
  const pending = await prisma.pendingTransaction.findFirst({ where: { id, orgId } });
  if (!pending) throw new ApprovalError("Pending transaction not found.");
  return pending;
}

// Owner/Admin/Accountant only (permission matrix — see lib/permissions.ts).
// Posts through the SAME real creation function the direct-posting path
// uses, with the staged payload, then marks the draft approved.
export async function approvePendingTransaction(actor: ApprovalActor, id: string) {
  if (!hasPermission(actor, "approveTransactions")) {
    throw new ApprovalForbiddenError("You do not have permission to approve transactions.");
  }
  const pending = await loadOwnedPending(actor.orgId, id);
  if (pending.status === "approved") {
    throw new ApprovalError("This transaction has already been approved.");
  }

  const posted = await postApprovedPayload(actor.orgId, pending.type, pending.payload);

  await prisma.pendingTransaction.update({
    where: { id: pending.id },
    data: {
      status: "approved",
      reviewedById: actor.userId,
      reviewedAt: new Date(),
      rejectionReason: null,
    },
  });

  return posted;
}

// Lets an approver adjust the staged payload before posting (e.g. fix a
// miscoded account) without sending it back to the submitter first.
export async function editThenApprove(actor: ApprovalActor, id: string, editedRawPayload: unknown) {
  if (!hasPermission(actor, "approveTransactions")) {
    throw new ApprovalForbiddenError("You do not have permission to approve transactions.");
  }
  const pending = await loadOwnedPending(actor.orgId, id);
  if (pending.status === "approved") {
    throw new ApprovalError("This transaction has already been approved.");
  }

  const payload = serializeForType(pending.type, editedRawPayload);
  const posted = await postApprovedPayload(actor.orgId, pending.type, payload as unknown as Prisma.JsonValue);

  await prisma.pendingTransaction.update({
    where: { id: pending.id },
    data: {
      payload,
      status: "approved",
      reviewedById: actor.userId,
      reviewedAt: new Date(),
      rejectionReason: null,
    },
  });

  return posted;
}

// Rejects a draft — never posts anything. The reason is stored so the
// submitting user can see why (surfaced via listMySubmissionNotices).
export async function rejectPendingTransaction(actor: ApprovalActor, id: string, reason: string) {
  if (!hasPermission(actor, "rejectTransactions")) {
    throw new ApprovalForbiddenError("You do not have permission to reject transactions.");
  }
  const trimmed = reason.trim();
  if (!trimmed) throw new ApprovalError("A rejection reason is required.");

  const pending = await loadOwnedPending(actor.orgId, id);
  if (pending.status === "approved") {
    throw new ApprovalError("Cannot reject a transaction that has already been approved.");
  }

  await prisma.pendingTransaction.update({
    where: { id: pending.id },
    data: {
      status: "rejected",
      rejectionReason: trimmed,
      reviewedById: actor.userId,
      reviewedAt: new Date(),
    },
  });
}

// Kicks a draft back to the submitter with a note, WITHOUT deleting it —
// the submitter can see the note and (outside the scope of this foundation —
// see the report) a future edit-and-resubmit UI could reuse the same draft.
export async function requestCorrection(actor: ApprovalActor, id: string, note: string) {
  if (!hasPermission(actor, "rejectTransactions")) {
    throw new ApprovalForbiddenError("You do not have permission to review transactions.");
  }
  const trimmed = note.trim();
  if (!trimmed) throw new ApprovalError("A correction note is required.");

  const pending = await loadOwnedPending(actor.orgId, id);
  if (pending.status === "approved") {
    throw new ApprovalError("Cannot request a correction on a transaction that has already been approved.");
  }

  await prisma.pendingTransaction.update({
    where: { id: pending.id },
    data: {
      status: "needs_correction",
      rejectionReason: trimmed,
      reviewedById: actor.userId,
      reviewedAt: new Date(),
    },
  });
}

// Drafts awaiting review, oldest first (FIFO). Org-scoped. Used by the
// dashboard "Pending Approvals" widget — callers should also gate visibility
// on `hasPermission(ctx, "approveTransactions")` before rendering it.
export function listPendingApprovals(orgId: string) {
  return prisma.pendingTransaction.findMany({
    where: { orgId, status: "pending" },
    include: { submittedBy: { select: { name: true } } },
    orderBy: { submittedAt: "asc" },
    take: 50,
  });
}

// Rejected / needs-correction drafts a specific user submitted — the "simple
// in-app flag on their next relevant view" the spec calls for, in lieu of a
// full notification system. Org-scoped AND submitter-scoped.
export function listMySubmissionNotices(orgId: string, userId: string) {
  return prisma.pendingTransaction.findMany({
    where: { orgId, submittedById: userId, status: { in: ["rejected", "needs_correction"] } },
    orderBy: { reviewedAt: "desc" },
    take: 20,
  });
}

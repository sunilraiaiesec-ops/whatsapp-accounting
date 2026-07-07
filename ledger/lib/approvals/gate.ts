import { requiresApproval } from "@/lib/approvals/config";
import { submitForApproval } from "@/lib/approvals/engine";
import { estimateAmountMinor } from "@/lib/approvals/payloads";
import type { PendingTransactionType } from "@/lib/approvals/types";

export type GateActor = {
  orgId: string;
  userId: string;
  role: string;
  approvalWorkflowEnabled: boolean;
  baseCurrency: string;
};

export type GateResult = { gated: true; pendingId: string } | { gated: false };

// The single enforcement point every gated server action (app/actions/
// documents.ts, app/actions/inventory.ts, and — see the report for the
// fast-follow — app/actions/command.ts / bantoo.ts) calls BEFORE touching
// the ledger/inventory. This is intentionally NOT a UI-layer check: it lives
// in lib/, is driven only by `ctx.role`/`ctx.approvalWorkflowEnabled` read
// fresh from the DB-backed session context, and callers MUST branch on the
// result rather than call the real posting function unconditionally.
export async function gateTransaction(
  actor: GateActor,
  type: PendingTransactionType,
  rawPayload: unknown,
  extra: { attachmentId?: string | null; aiConfidence?: number | null } = {},
): Promise<GateResult> {
  const amountMinor = estimateAmountMinor(type, rawPayload);
  if (!requiresApproval(actor.role, type, amountMinor, actor.approvalWorkflowEnabled)) {
    return { gated: false };
  }

  const created = await submitForApproval({
    orgId: actor.orgId,
    submittedById: actor.userId,
    type,
    rawPayload,
    baseCurrency: actor.baseCurrency,
    attachmentId: extra.attachmentId ?? null,
    aiConfidence: extra.aiConfidence ?? null,
  });
  return { gated: true, pendingId: created.id };
}

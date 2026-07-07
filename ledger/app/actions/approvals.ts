"use server";

import { revalidatePath } from "next/cache";

import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import {
  approvePendingTransaction,
  editThenApprove,
  rejectPendingTransaction,
  requestCorrection,
} from "@/lib/approvals/engine";
import { ApprovalError } from "@/lib/approvals/types";
import { DocumentError } from "@/lib/documents";
import { LedgerError } from "@/lib/ledger";
import { getEffectiveSubscription } from "@/lib/billing/subscription";
import { getPlanLimits } from "@/lib/billing/plans";

export type ApprovalActionState = { error?: string; success?: string };

function fail(err: unknown): ApprovalActionState {
  if (err instanceof ApprovalError || err instanceof DocumentError || err instanceof LedgerError) {
    return { error: err.message };
  }
  console.error(err);
  return { error: "Something went wrong. Please try again." };
}

export async function approvePendingTransactionAction(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  try {
    await approvePendingTransaction(ctx, id);
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard");
  return { success: "Approved and posted." };
}

export async function rejectPendingTransactionAction(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "");
  try {
    await rejectPendingTransaction(ctx, id, reason);
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard");
  return { success: "Rejected." };
}

export async function requestCorrectionAction(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const note = String(formData.get("note") || "");
  try {
    await requestCorrection(ctx, id, note);
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard");
  return { success: "Sent back for correction." };
}

// Accepts the SAME JSON shape as the draft's stored payload (edited by the
// approver) — the client posts back the edited draft's own fields, not a
// free-form object.
export async function editThenApproveAction(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  let editedRawPayload: unknown;
  try {
    editedRawPayload = JSON.parse(String(formData.get("payload") || "{}"));
  } catch {
    return { error: "Could not read the edited transaction." };
  }
  try {
    await editThenApprove(ctx, id, editedRawPayload);
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard");
  return { success: "Approved with edits and posted." };
}

export type SettingsActionState = { error?: string; success?: string };

// Owner/Admin only (manageSettings) — flips the org-level approval-workflow
// toggle (§11). See the report for exactly how this should be wrapped by
// lib/billing/plans.ts's Business+ feature flag once that lands.
export async function toggleApprovalWorkflowAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const ctx = await requireContext();
  if (!hasPermission(ctx, "manageSettings")) {
    return { error: "You do not have permission to change this setting." };
  }
  const enabled = String(formData.get("enabled") || "") === "true";

  // Reconciliation with the parallel billing task: approval workflow is a
  // Business+ feature (lib/billing/plans.ts `features.approvalWorkflow`).
  // Turning it OFF is always allowed (never lock an org out of its own
  // setting); turning it ON requires the org's current effective plan to
  // include the feature.
  if (enabled) {
    const { effectivePlan } = await getEffectiveSubscription(ctx.orgId);
    if (!getPlanLimits(effectivePlan).features.approvalWorkflow) {
      return { error: "Approval workflows are available on the Business plan and above. Upgrade to turn this on." };
    }
  }

  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: { approvalWorkflowEnabled: enabled },
  });
  revalidatePath("/settings");
  return { success: enabled ? "Approval workflow turned on." : "Approval workflow turned off." };
}

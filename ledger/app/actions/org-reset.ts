"use server";

import { revalidatePath } from "next/cache";

import { requireContext } from "@/lib/auth/current";
import {
  OrgResetError,
  requestOrgReset,
  verifyOrgResetCode,
  cancelOrgReset,
  executeOrgReset,
  getResetStatus,
} from "@/lib/org-reset";

export type ResetActionState = {
  error?: string;
  success?: string;
  deleteAllowedAt?: string;
};

function fail(err: unknown): ResetActionState {
  if (err instanceof OrgResetError) return { error: err.message };
  console.error(err);
  return { error: "Something went wrong. Please try again." };
}

async function ownerContext() {
  const ctx = await requireContext();
  if (ctx.role !== "OWNER") {
    throw new OrgResetError("Only the business owner can reset books.");
  }
  return ctx;
}

export async function getOrgResetStatusAction() {
  const ctx = await ownerContext();
  return getResetStatus(ctx.orgId);
}

export async function requestOrgResetAction(
  _prev: ResetActionState,
  _formData: FormData,
): Promise<ResetActionState> {
  try {
    const ctx = await ownerContext();
    await requestOrgReset(ctx.orgId, ctx.userId, ctx.userEmail, ctx.orgName);
    revalidatePath("/settings");
    return {
      success: "Verification code sent. Check your email and enter the code below.",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function verifyOrgResetCodeAction(
  _prev: ResetActionState,
  formData: FormData,
): Promise<ResetActionState> {
  try {
    const ctx = await ownerContext();
    const code = String(formData.get("code") || "");
    const result = await verifyOrgResetCode(ctx.orgId, ctx.userId, code);
    revalidatePath("/settings");
    return {
      success:
        "Code verified. For your safety, you must wait 2 hours before you can permanently reset your books.",
      deleteAllowedAt: result.deleteAllowedAt,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelOrgResetAction(
  _prev: ResetActionState,
  _formData: FormData,
): Promise<ResetActionState> {
  try {
    const ctx = await ownerContext();
    await cancelOrgReset(ctx.orgId, ctx.userId);
    revalidatePath("/settings");
    return { success: "Reset request cancelled." };
  } catch (err) {
    return fail(err);
  }
}

export async function executeOrgResetAction(
  _prev: ResetActionState,
  formData: FormData,
): Promise<ResetActionState> {
  try {
    const ctx = await ownerContext();
    const confirmName = String(formData.get("confirmName") || "");
    await executeOrgReset(ctx.orgId, ctx.userId, ctx.orgName, confirmName);
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return {
      success:
        "Your books have been reset to factory defaults. All transactions, customers, and suppliers were removed.",
    };
  } catch (err) {
    return fail(err);
  }
}

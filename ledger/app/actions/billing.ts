"use server";

import { revalidatePath } from "next/cache";

import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { getCurrentContext } from "@/lib/auth/current";
import { isPlatformAdmin } from "@/lib/billing/admin-access";
import { adminSetPlan } from "@/lib/billing/provider";
import { prisma } from "@/lib/prisma";
import { parseAmount } from "@/lib/money";

// ---------------------------------------------------------------------------
// Platform-admin action for manually setting an org's plan/status — the
// single working end-to-end path for testing plan changes before a real
// payment provider exists (see lib/billing/provider.ts).
//
// This action ALWAYS goes through the manual provider's adminSetPlan()
// directly, rather than getPaymentProvider()'s auto-selected provider. Even
// once a real provider (Stripe/Mobile Money) is wired up, a platform admin
// must still be able to force-set any org's plan by hand (comping a
// customer, fixing a stuck webhook, support overrides, etc.) — that's an
// orthogonal capability to "which provider handles self-service checkout",
// so it deliberately bypasses getPaymentProvider() rather than being at its
// mercy.
// ---------------------------------------------------------------------------

const VALID_PLANS: readonly SubscriptionPlan[] = ["FREE", "BUSINESS", "ENTERPRISE"];
const VALID_STATUSES: readonly SubscriptionStatus[] = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "FREE",
];

export type AdminSetOrgPlanResult =
  | { success: string }
  | { error: string };

export async function adminSetOrgPlanAction(
  orgId: string,
  formData: FormData,
): Promise<AdminSetOrgPlanResult> {
  const ctx = await getCurrentContext();
  if (!ctx || !isPlatformAdmin(ctx.userEmail)) {
    return { error: "Not authorized." };
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, baseCurrency: true },
  });
  if (!org) {
    return { error: "Organization not found." };
  }

  const planRaw = String(formData.get("plan") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  if (!VALID_PLANS.includes(planRaw as SubscriptionPlan)) {
    return { error: `Invalid plan: ${planRaw}` };
  }
  if (!VALID_STATUSES.includes(statusRaw as SubscriptionStatus)) {
    return { error: `Invalid status: ${statusRaw}` };
  }
  const plan = planRaw as SubscriptionPlan;
  const status = statusRaw as SubscriptionStatus;

  const amountRaw = formData.get("amountMinorUnits");
  const amountMinorUnits =
    typeof amountRaw === "string" && amountRaw.trim() !== ""
      ? parseAmount(amountRaw, org.baseCurrency)
      : undefined;

  const periodMonthsRaw = formData.get("periodMonths");
  const periodMonths =
    typeof periodMonthsRaw === "string" && periodMonthsRaw.trim() !== ""
      ? Math.max(1, Math.trunc(Number(periodMonthsRaw)))
      : 1;

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" && notesRaw.trim() !== "" ? notesRaw.trim() : undefined;

  try {
    await adminSetPlan(orgId, {
      plan,
      status,
      periodMonths,
      amountMinorUnits,
      notes,
      createdById: ctx.userId,
    });
  } catch (err) {
    console.error(`[actions/billing] adminSetOrgPlanAction failed (org=${orgId}):`, err);
    return { error: "Failed to update the subscription. Please try again." };
  }

  revalidatePath("/admin/commercial");
  return { success: `Set ${org.id} to ${plan}/${status}.` };
}

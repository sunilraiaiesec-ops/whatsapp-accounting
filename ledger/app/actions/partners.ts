"use server";

import { revalidatePath } from "next/cache";
import type { CommissionStatus } from "@prisma/client";

import { getCurrentContext } from "@/lib/auth/current";
import { isPlatformAdmin } from "@/lib/billing/admin-access";
import { createPartner, setCommissionStatus, PartnerError } from "@/lib/billing/partners";

export type PartnerActionState = { error?: string; done?: boolean };

// Server actions can be invoked directly (not only via the page's form), so
// this checks platform-admin access itself rather than trusting the
// page-level gate alone.
async function requirePlatformAdmin(): Promise<void> {
  const ctx = await getCurrentContext();
  if (!isPlatformAdmin(ctx?.userEmail)) {
    throw new PartnerError("Not authorized.");
  }
}

export async function createPartnerAction(
  _prev: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  try {
    await requirePlatformAdmin();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Partner name is required." };

    const email = String(formData.get("email") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const referralCode = String(formData.get("referralCode") ?? "").trim() || null;

    await createPartner({ name, email, phone, referralCode });
    revalidatePath("/admin/partners");
    return { done: true };
  } catch (err) {
    if (err instanceof PartnerError) return { error: err.message };
    console.error(err);
    return { error: "Could not create partner. Please try again." };
  }
}

export async function setCommissionStatusAction(
  _prev: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  try {
    await requirePlatformAdmin();

    const commissionId = String(formData.get("commissionId") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim() as CommissionStatus;
    if (!commissionId || !status) return { error: "Missing commission id or status." };

    await setCommissionStatus(commissionId, status);
    revalidatePath("/admin/partners");
    revalidatePath("/partner");
    return { done: true };
  } catch (err) {
    if (err instanceof PartnerError) return { error: err.message };
    console.error(err);
    return { error: "Could not update commission status. Please try again." };
  }
}

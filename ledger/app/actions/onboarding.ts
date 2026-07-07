"use server";

import { redirect } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";
import { getOrCreateWizard, setCurrentStep } from "@/lib/migration/wizard";

// Persists the "How are you starting?" choice from the one-time onboarding
// screen shown right after signup. "New business" needs no wizard row at
// all (Settings → Migration will lazily create a NOT_STARTED one if they
// ever open it later); "Existing business" creates the wizard immediately
// and sends the user straight into Step 1.
export async function chooseOnboardingAction(choice: "new_business" | "existing_business"): Promise<void> {
  const ctx = await requireContext();

  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: { onboardingChoice: choice === "new_business" ? "NEW_BUSINESS" : "EXISTING_BUSINESS" },
  });

  if (choice === "existing_business") {
    await getOrCreateWizard(ctx.orgId);
    await setCurrentStep(ctx.orgId, 1);
    redirect("/migration");
  }

  redirect("/dashboard");
}

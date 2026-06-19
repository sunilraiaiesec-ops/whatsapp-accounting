"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireContext } from "@/lib/auth/current";
import { createParty } from "@/lib/parties";

export type PartyState = { error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(["customer", "supplier", "both"]),
  phone: z.string().trim().optional(),
});

export async function createPartyAction(
  _prev: PartyState,
  formData: FormData,
): Promise<PartyState> {
  const ctx = await requireContext();
  const parsed = schema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || "both",
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await createParty(ctx.orgId, parsed.data);
  redirect(parsed.data.type === "supplier" ? "/suppliers" : "/customers");
}

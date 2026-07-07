"use server";

import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";

// Org-scoped lookup of a supplier's contact fields, used when the user
// overrides the suggested supplier in the low-stock quote-request modal
// (the search dropdown itself reuses searchBantooEntities, which doesn't
// return phone/whatsapp — this fetches them for the chosen candidate only).
export async function getSupplierContactAction(
  partyId: string,
): Promise<{ id: string; name: string; phone: string | null; whatsapp: string | null } | null> {
  const ctx = await requireContext();
  const party = await prisma.party.findFirst({
    where: { orgId: ctx.orgId, id: partyId },
    select: { id: true, name: true, phone: true, whatsapp: true },
  });
  return party ?? null;
}

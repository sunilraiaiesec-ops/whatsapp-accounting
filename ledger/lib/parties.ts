import { prisma } from "@/lib/prisma";

export function listParties(orgId: string, type?: "customer" | "supplier") {
  return prisma.party.findMany({
    where: {
      orgId,
      ...(type ? { type: { in: [type, "both"] } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function createParty(
  orgId: string,
  data: { name: string; type: string; phone?: string | null },
) {
  return prisma.party.create({
    data: {
      orgId,
      name: data.name.trim(),
      type: data.type,
      phone: data.phone?.trim() || null,
    },
  });
}

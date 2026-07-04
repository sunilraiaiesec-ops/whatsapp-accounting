"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireContext } from "@/lib/auth/current";

export type AccountState = { error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  subtype: z.enum(["bank", "cash", "credit_card"]),
});

const CODE_START: Record<string, number> = {
  cash: 1001,
  bank: 1011,
  credit_card: 2200,
};

function nextCode(used: Set<string>, start: number): string {
  let n = start;
  while (used.has(String(n))) n++;
  return String(n);
}

export async function createBankAccountAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const ctx = await requireContext();
  const parsed = schema.safeParse({
    name: formData.get("name"),
    subtype: formData.get("subtype") || "bank",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await prisma.account.findMany({
    where: { orgId: ctx.orgId },
    select: { code: true },
  });
  const used = new Set(existing.map((a) => a.code));
  const isCreditCard = parsed.data.subtype === "credit_card";

  await prisma.account.create({
    data: {
      orgId: ctx.orgId,
      code: nextCode(used, CODE_START[parsed.data.subtype] ?? 1011),
      name: parsed.data.name,
      type: isCreditCard ? "LIABILITY" : "ASSET",
      subtype: parsed.data.subtype,
      currency: ctx.baseCurrency,
    },
  });

  redirect("/bank-and-cash-accounts");
}

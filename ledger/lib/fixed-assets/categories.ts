import type { DepreciationMethod } from "@prisma/client";

import { DocumentError } from "@/lib/documents";
import {
  ensureAccumulatedDepreciationAccount,
  ensureDepreciationExpenseAccount,
  ensureFixedAssetAccount,
} from "@/lib/accounts";
import { prisma } from "@/lib/prisma";

export function listFixedAssetCategories(orgId: string) {
  return prisma.fixedAssetCategory.findMany({
    where: { orgId },
    include: {
      fixedAssetAccount: true,
      accumulatedDeprecAccount: true,
      depreciationExpenseAccount: true,
    },
    orderBy: { name: "asc" },
  });
}

export type CreateFixedAssetCategoryInput = {
  name: string;
  fixedAssetAccountId: string;
  accumulatedDeprecAccountId: string;
  depreciationExpenseAccountId: string;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
  decliningBalanceRate?: number | null;
};

function validateCategoryInput(input: CreateFixedAssetCategoryInput): void {
  if (!input.name.trim()) throw new DocumentError("Category name is required");
  if (input.usefulLifeMonths <= 0) {
    throw new DocumentError("Useful life must be positive");
  }
  if (
    input.depreciationMethod === "DECLINING_BALANCE" &&
    input.decliningBalanceRate != null &&
    input.decliningBalanceRate <= 0
  ) {
    throw new DocumentError("Declining balance rate must be positive");
  }
}

export async function createFixedAssetCategory(
  orgId: string,
  input: CreateFixedAssetCategoryInput,
) {
  validateCategoryInput(input);
  const existing = await prisma.fixedAssetCategory.findUnique({
    where: { orgId_name: { orgId, name: input.name.trim() } },
  });
  if (existing) throw new DocumentError("A category with this name already exists");

  return prisma.fixedAssetCategory.create({
    data: {
      orgId,
      name: input.name.trim(),
      fixedAssetAccountId: input.fixedAssetAccountId,
      accumulatedDeprecAccountId: input.accumulatedDeprecAccountId,
      depreciationExpenseAccountId: input.depreciationExpenseAccountId,
      usefulLifeMonths: input.usefulLifeMonths,
      depreciationMethod: input.depreciationMethod,
      decliningBalanceRate: input.decliningBalanceRate ?? null,
    },
  });
}

export async function updateFixedAssetCategory(
  orgId: string,
  id: string,
  input: CreateFixedAssetCategoryInput,
) {
  validateCategoryInput(input);
  const existing = await prisma.fixedAssetCategory.findFirst({ where: { id, orgId } });
  if (!existing) throw new DocumentError("Category not found");

  const duplicate = await prisma.fixedAssetCategory.findFirst({
    where: { orgId, name: input.name.trim(), NOT: { id } },
  });
  if (duplicate) throw new DocumentError("A category with this name already exists");

  return prisma.fixedAssetCategory.update({
    where: { id },
    data: {
      name: input.name.trim(),
      fixedAssetAccountId: input.fixedAssetAccountId,
      accumulatedDeprecAccountId: input.accumulatedDeprecAccountId,
      depreciationExpenseAccountId: input.depreciationExpenseAccountId,
      usefulLifeMonths: input.usefulLifeMonths,
      depreciationMethod: input.depreciationMethod,
      decliningBalanceRate: input.decliningBalanceRate ?? null,
    },
  });
}

// The 6 example categories named in the Phase 1 spec. Never auto-seeded for
// every org — this is only invoked from the explicit "Quick add common
// categories" button on the categories page. Skips any name that already
// exists for the org so it's safe to click more than once.
const DEFAULT_CATEGORY_TEMPLATES: {
  name: string;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
}[] = [
  { name: "Vehicles", usefulLifeMonths: 60, depreciationMethod: "DECLINING_BALANCE" },
  { name: "Machinery", usefulLifeMonths: 96, depreciationMethod: "STRAIGHT_LINE" },
  { name: "Computers", usefulLifeMonths: 36, depreciationMethod: "DECLINING_BALANCE" },
  { name: "Furniture", usefulLifeMonths: 84, depreciationMethod: "STRAIGHT_LINE" },
  { name: "Buildings", usefulLifeMonths: 360, depreciationMethod: "STRAIGHT_LINE" },
  { name: "Office Equipment", usefulLifeMonths: 60, depreciationMethod: "STRAIGHT_LINE" },
];

export async function createDefaultCategories(orgId: string): Promise<number> {
  const [fixedAssetAccount, accumulatedDeprecAccount, depreciationExpenseAccount, existing] =
    await Promise.all([
      prisma.$transaction((tx) => ensureFixedAssetAccount(tx, orgId)),
      prisma.$transaction((tx) => ensureAccumulatedDepreciationAccount(tx, orgId)),
      prisma.$transaction((tx) => ensureDepreciationExpenseAccount(tx, orgId)),
      prisma.fixedAssetCategory.findMany({ where: { orgId }, select: { name: true } }),
    ]);
  const existingNames = new Set(existing.map((c) => c.name));

  const toCreate = DEFAULT_CATEGORY_TEMPLATES.filter((t) => !existingNames.has(t.name));
  if (toCreate.length === 0) return 0;

  await prisma.fixedAssetCategory.createMany({
    data: toCreate.map((t) => ({
      orgId,
      name: t.name,
      fixedAssetAccountId: fixedAssetAccount.id,
      accumulatedDeprecAccountId: accumulatedDeprecAccount.id,
      depreciationExpenseAccountId: depreciationExpenseAccount.id,
      usefulLifeMonths: t.usefulLifeMonths,
      depreciationMethod: t.depreciationMethod,
    })),
  });
  return toCreate.length;
}

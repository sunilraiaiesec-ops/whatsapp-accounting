import type { DepreciationMethod, FixedAsset, FixedAssetStatus } from "@prisma/client";

import { DocumentError } from "@/lib/documents";
import { buildSchedule } from "@/lib/fixed-assets/depreciation-schedule";
import { postEntryWithin, removeEntryWithin } from "@/lib/ledger";
import { nextDocNumber } from "@/lib/numbering";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Fixed asset CRUD — shaped like lib/inventory.ts's receiveGoods(): validate,
// wrap in prisma.$transaction, post the journal entry via postEntryWithin,
// allocate a document number, create the row with journalEntryId set, and
// (unique to fixed assets) generate the full depreciation schedule in the
// same transaction.
// ---------------------------------------------------------------------------

export type CreateFixedAssetInput = {
  name: string;
  categoryId?: string | null;
  partyId?: string | null;
  purchaseDate: Date;
  placedInServiceDate: Date;
  purchaseCost: bigint;
  salvageValue: bigint;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
  decliningBalanceRate?: number | null;
  fixedAssetAccountId: string;
  accumulatedDeprecAccountId: string;
  depreciationExpenseAccountId: string;
  sourceAccountId: string;
  reference?: string | null;
  notes?: string | null;
};

function validateAssetInput(input: CreateFixedAssetInput): void {
  if (!input.name.trim()) throw new DocumentError("Asset name is required");
  if (input.purchaseCost <= 0n) throw new DocumentError("Purchase cost must be positive");
  if (input.salvageValue < 0n) {
    throw new DocumentError("Salvage value must not be negative");
  }
  if (input.salvageValue > input.purchaseCost) {
    throw new DocumentError("Salvage value cannot exceed cost");
  }
  if (input.usefulLifeMonths <= 0) {
    throw new DocumentError("Useful life must be positive");
  }
  if (input.placedInServiceDate.getTime() < input.purchaseDate.getTime()) {
    throw new DocumentError("Placed-in-service date cannot be before the purchase date");
  }
}

export async function createFixedAsset(orgId: string, input: CreateFixedAssetInput) {
  validateAssetInput(input);

  return prisma.$transaction(async (tx) => {
    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.purchaseDate,
      description: input.notes ?? null,
      reference: input.reference ?? null,
      sourceType: "fixed_asset_purchase",
      lines: [
        { accountId: input.fixedAssetAccountId, debit: input.purchaseCost },
        {
          accountId: input.sourceAccountId,
          credit: input.purchaseCost,
          partyId: input.partyId ?? null,
        },
      ],
    });

    const code = await nextDocNumber(tx, orgId, "FA");

    const asset = await tx.fixedAsset.create({
      data: {
        orgId,
        code,
        name: input.name.trim(),
        categoryId: input.categoryId ?? null,
        partyId: input.partyId ?? null,
        purchaseDate: input.purchaseDate,
        placedInServiceDate: input.placedInServiceDate,
        purchaseCost: input.purchaseCost,
        salvageValue: input.salvageValue,
        usefulLifeMonths: input.usefulLifeMonths,
        depreciationMethod: input.depreciationMethod,
        decliningBalanceRate: input.decliningBalanceRate ?? null,
        fixedAssetAccountId: input.fixedAssetAccountId,
        accumulatedDeprecAccountId: input.accumulatedDeprecAccountId,
        depreciationExpenseAccountId: input.depreciationExpenseAccountId,
        sourceAccountId: input.sourceAccountId,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        journalEntryId: entry.id,
      },
    });

    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: asset.id } });

    const schedule = buildSchedule(input.depreciationMethod, {
      cost: input.purchaseCost,
      salvage: input.salvageValue,
      usefulLifeMonths: input.usefulLifeMonths,
      placedInServiceDate: input.placedInServiceDate,
      ratePercent: input.decliningBalanceRate ?? null,
    });

    await tx.fixedAssetDepreciationSchedule.createMany({
      data: schedule.map((p) => ({
        orgId,
        assetId: asset.id,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        depreciationAmount: p.depreciationAmount,
        accumulatedDepreciationAfter: p.accumulatedDepreciationAfter,
        bookValueAfter: p.bookValueAfter,
        status: p.status,
      })),
    });

    return asset;
  });
}

// True when any field that participates in the purchase journal or the
// depreciation schedule differs from the stored asset — these are only
// editable while accumulatedDepreciation is still zero (see updateFixedAsset).
function lockedFieldsChanged(existing: FixedAsset, input: CreateFixedAssetInput): boolean {
  const existingRate =
    existing.decliningBalanceRate == null ? null : Number(existing.decliningBalanceRate);
  const inputRate = input.decliningBalanceRate ?? null;
  return (
    existing.purchaseDate.getTime() !== input.purchaseDate.getTime() ||
    existing.placedInServiceDate.getTime() !== input.placedInServiceDate.getTime() ||
    existing.purchaseCost !== input.purchaseCost ||
    existing.salvageValue !== input.salvageValue ||
    existing.usefulLifeMonths !== input.usefulLifeMonths ||
    existing.depreciationMethod !== input.depreciationMethod ||
    existingRate !== inputRate ||
    existing.fixedAssetAccountId !== input.fixedAssetAccountId ||
    existing.accumulatedDeprecAccountId !== input.accumulatedDeprecAccountId ||
    existing.depreciationExpenseAccountId !== input.depreciationExpenseAccountId ||
    existing.sourceAccountId !== input.sourceAccountId
  );
}

// name/notes/reference/category/party are always editable. Cost, dates,
// useful life, method, and the four accounts are editable only until the
// first depreciation period posts — changing them after that would silently
// desync the schedule from the ledger, so they lock instead (mirrors
// lib/document-update.ts's reverse-and-repost pattern for the purchase entry
// when a locked field genuinely does change pre-depreciation).
export async function updateFixedAsset(
  orgId: string,
  id: string,
  input: CreateFixedAssetInput,
) {
  validateAssetInput(input);
  const existing = await prisma.fixedAsset.findFirst({ where: { id, orgId } });
  if (!existing) throw new DocumentError("Asset not found");
  if (existing.status !== "ACTIVE") {
    throw new DocumentError("Disposed assets cannot be edited");
  }

  const changed = lockedFieldsChanged(existing, input);
  if (changed && existing.accumulatedDepreciation !== 0n) {
    throw new DocumentError(
      "Depreciation has already posted for this asset — cost, dates, useful life, method, and accounts can no longer be changed",
    );
  }

  return prisma.$transaction(async (tx) => {
    if (changed) {
      await removeEntryWithin(tx, existing.journalEntryId);
      const entry = await postEntryWithin(tx, {
        orgId,
        entryDate: input.purchaseDate,
        description: input.notes ?? null,
        reference: input.reference ?? null,
        sourceType: "fixed_asset_purchase",
        sourceId: id,
        lines: [
          { accountId: input.fixedAssetAccountId, debit: input.purchaseCost },
          {
            accountId: input.sourceAccountId,
            credit: input.purchaseCost,
            partyId: input.partyId ?? null,
          },
        ],
      });

      await tx.fixedAssetDepreciationSchedule.deleteMany({ where: { assetId: id } });
      const schedule = buildSchedule(input.depreciationMethod, {
        cost: input.purchaseCost,
        salvage: input.salvageValue,
        usefulLifeMonths: input.usefulLifeMonths,
        placedInServiceDate: input.placedInServiceDate,
        ratePercent: input.decliningBalanceRate ?? null,
      });
      await tx.fixedAssetDepreciationSchedule.createMany({
        data: schedule.map((p) => ({
          orgId,
          assetId: id,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          depreciationAmount: p.depreciationAmount,
          accumulatedDepreciationAfter: p.accumulatedDepreciationAfter,
          bookValueAfter: p.bookValueAfter,
          status: p.status,
        })),
      });

      return tx.fixedAsset.update({
        where: { id },
        data: {
          name: input.name.trim(),
          categoryId: input.categoryId ?? null,
          partyId: input.partyId ?? null,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          purchaseDate: input.purchaseDate,
          placedInServiceDate: input.placedInServiceDate,
          purchaseCost: input.purchaseCost,
          salvageValue: input.salvageValue,
          usefulLifeMonths: input.usefulLifeMonths,
          depreciationMethod: input.depreciationMethod,
          decliningBalanceRate: input.decliningBalanceRate ?? null,
          fixedAssetAccountId: input.fixedAssetAccountId,
          accumulatedDeprecAccountId: input.accumulatedDeprecAccountId,
          depreciationExpenseAccountId: input.depreciationExpenseAccountId,
          sourceAccountId: input.sourceAccountId,
          journalEntryId: entry.id,
        },
      });
    }

    return tx.fixedAsset.update({
      where: { id },
      data: {
        name: input.name.trim(),
        categoryId: input.categoryId ?? null,
        partyId: input.partyId ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      },
    });
  });
}

// Only an asset with zero posted depreciation and no disposal can be deleted
// (the spec's "reversal/deletion done safely" carve-out) — anything else must
// be corrected going forward via dispose/write-off, never deleted outright.
export async function deleteFixedAsset(orgId: string, id: string): Promise<void> {
  const existing = await prisma.fixedAsset.findFirst({ where: { id, orgId } });
  if (!existing) throw new DocumentError("Asset not found");
  if (existing.status !== "ACTIVE" || existing.accumulatedDepreciation !== 0n) {
    throw new DocumentError(
      "Only an asset with no posted depreciation and no disposal can be deleted — dispose it instead",
    );
  }

  await prisma.$transaction(async (tx) => {
    // Cascades to the depreciation schedule rows (onDelete: Cascade).
    await tx.fixedAsset.delete({ where: { id } });
    await removeEntryWithin(tx, existing.journalEntryId);
  });
}

export function listFixedAssets(orgId: string, opts: { status?: FixedAssetStatus } = {}) {
  return prisma.fixedAsset.findMany({
    where: { orgId, ...(opts.status ? { status: opts.status } : {}) },
    include: { category: true, party: true },
    orderBy: { code: "asc" },
  });
}

export function getFixedAsset(orgId: string, id: string) {
  return prisma.fixedAsset.findFirst({
    where: { id, orgId },
    include: {
      category: true,
      party: true,
      fixedAssetAccount: true,
      accumulatedDeprecAccount: true,
      depreciationExpenseAccount: true,
      sourceAccount: true,
      disposalReceivingAccount: true,
      schedule: { orderBy: { periodStart: "asc" } },
    },
  });
}

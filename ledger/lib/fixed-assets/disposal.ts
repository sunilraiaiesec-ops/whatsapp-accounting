import { ensureGainOnDisposalAccount, ensureLossOnDisposalAccount } from "@/lib/accounts";
import { DocumentError } from "@/lib/documents";
import { postEntryWithin, type PostLine } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";

export type DisposeFixedAssetInput = {
  date: Date;
  proceeds: bigint;
  // Required when proceeds > 0n; ignored for a pure write-off.
  receivingAccountId?: string | null;
  notes?: string | null;
};

// bookValue = cost - accumulatedDepreciation (the POSTED total, per spec).
// gainLoss = proceeds - bookValue. The journal always balances by
// construction: Dr proceeds (if any) + Dr accumulatedDepreciation (if any) +
// Dr loss (if gainLoss < 0) == Cr cost + Cr gain (if gainLoss > 0) — both
// sides reduce to `proceeds + accumulatedDepreciation` vs `cost + gainLoss`,
// which are equal by definition of gainLoss. A proceeds=0 write-off with
// bookValue=0 (fully depreciated) needs no gain/loss line at all; a
// proceeds=0 write-off with remaining book value posts a pure loss.
export async function disposeFixedAsset(
  orgId: string,
  assetId: string,
  input: DisposeFixedAssetInput,
) {
  if (input.proceeds < 0n) throw new DocumentError("Sale proceeds must not be negative");
  if (input.proceeds > 0n && !input.receivingAccountId) {
    throw new DocumentError("Choose an account to receive the sale proceeds");
  }

  return prisma.$transaction(async (tx) => {
    const asset = await tx.fixedAsset.findFirst({ where: { id: assetId, orgId } });
    if (!asset) throw new DocumentError("Asset not found");
    if (asset.status !== "ACTIVE") {
      throw new DocumentError("This asset has already been disposed");
    }
    if (input.date.getTime() < asset.placedInServiceDate.getTime()) {
      throw new DocumentError("Disposal date cannot be before the placed-in-service date");
    }

    const bookValue = asset.purchaseCost - asset.accumulatedDepreciation;
    const gainLoss = input.proceeds - bookValue;

    const lines: PostLine[] = [];
    if (input.proceeds > 0n) {
      lines.push({ accountId: input.receivingAccountId!, debit: input.proceeds });
    }
    if (asset.accumulatedDepreciation > 0n) {
      lines.push({
        accountId: asset.accumulatedDeprecAccountId,
        debit: asset.accumulatedDepreciation,
      });
    }
    lines.push({ accountId: asset.fixedAssetAccountId, credit: asset.purchaseCost });

    if (gainLoss > 0n) {
      const gainAccount = await ensureGainOnDisposalAccount(tx, orgId);
      lines.push({ accountId: gainAccount.id, credit: gainLoss });
    } else if (gainLoss < 0n) {
      const lossAccount = await ensureLossOnDisposalAccount(tx, orgId);
      lines.push({ accountId: lossAccount.id, debit: -gainLoss });
    }

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? `Disposal — ${asset.name}`,
      sourceType: "fixed_asset_disposal",
      sourceId: asset.id,
      lines,
    });

    // Nothing can be posted against a disposed asset going forward — belt-
    // and-suspenders alongside postDepreciationPeriod's own ACTIVE-only guard.
    await tx.fixedAssetDepreciationSchedule.updateMany({
      where: { assetId: asset.id, status: "SCHEDULED" },
      data: { status: "SKIPPED" },
    });

    return tx.fixedAsset.update({
      where: { id: asset.id },
      data: {
        status: "DISPOSED",
        disposalDate: input.date,
        disposalProceeds: input.proceeds,
        disposalReceivingAccountId: input.receivingAccountId ?? null,
        disposalGainLoss: gainLoss,
        disposalNotes: input.notes ?? null,
        disposalJournalEntryId: entry.id,
      },
    });
  });
}

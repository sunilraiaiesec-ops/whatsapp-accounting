import { DocumentError } from "@/lib/documents";
import { postEntryWithin } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";

// Posts a single scheduled depreciation period: Dr depreciationExpenseAccount
// / Cr accumulatedDeprecAccount. The duplicate-posting guard is the atomic
// `updateMany({ where: { status: "SCHEDULED" } })` claim below — same idea as
// nextDocNumber's `ON CONFLICT` counter: two concurrent calls for the same
// period race on that one row's UPDATE, and only one can ever see
// `status: "SCHEDULED"` and flip it, so exactly one journal entry posts no
// matter how many times this is called concurrently.
export async function postDepreciationPeriod(orgId: string, scheduleId: string) {
  return prisma.$transaction(async (tx) => {
    const schedule = await tx.fixedAssetDepreciationSchedule.findFirst({
      where: { id: scheduleId, orgId },
      include: { asset: true },
    });
    if (!schedule) throw new DocumentError("Depreciation period not found");
    if (schedule.asset.status !== "ACTIVE") {
      throw new DocumentError("Disposed assets cannot be depreciated further");
    }
    if (schedule.periodStart.getTime() < schedule.asset.placedInServiceDate.getTime()) {
      throw new DocumentError("Cannot post depreciation before the placed-in-service date");
    }

    const claimed = await tx.fixedAssetDepreciationSchedule.updateMany({
      where: { id: scheduleId, orgId, status: "SCHEDULED" },
      data: { status: "POSTED", postedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new DocumentError("This period has already been posted (or is not due)");
    }

    const from = schedule.periodStart.toISOString().slice(0, 10);
    const to = schedule.periodEnd.toISOString().slice(0, 10);
    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: schedule.periodEnd,
      description: `Depreciation — ${schedule.asset.name} (${from} to ${to})`,
      sourceType: "fixed_asset_depreciation",
      sourceId: schedule.id,
      lines: [
        {
          accountId: schedule.asset.depreciationExpenseAccountId,
          debit: schedule.depreciationAmount,
        },
        {
          accountId: schedule.asset.accumulatedDeprecAccountId,
          credit: schedule.depreciationAmount,
        },
      ],
    });

    await tx.fixedAssetDepreciationSchedule.update({
      where: { id: scheduleId },
      data: { journalEntryId: entry.id },
    });

    await tx.fixedAsset.update({
      where: { id: schedule.assetId },
      data: { accumulatedDepreciation: { increment: schedule.depreciationAmount } },
    });

    return entry;
  });
}

export type PostDuePeriodsResult = {
  posted: string[];
  skipped: string[];
  errors: { scheduleId: string; message: string }[];
};

// Posts every SCHEDULED period due by `asOf` (default now), for one asset or
// the whole org, in periodStart order. Each period posts in its own
// transaction (via postDepreciationPeriod) so one failure never blocks the
// rest — matches the per-item loop style already used by
// scripts/refresh-demo.ts rather than one giant all-or-nothing transaction.
// `asOf` is an explicit parameter (not always "now") so callers/tests can
// drive the scheduler deterministically.
export async function postDuePeriods(
  orgId: string,
  opts: { assetId?: string; asOf?: Date } = {},
): Promise<PostDuePeriodsResult> {
  const asOf = opts.asOf ?? new Date();
  const due = await prisma.fixedAssetDepreciationSchedule.findMany({
    where: {
      orgId,
      status: "SCHEDULED",
      periodEnd: { lte: asOf },
      ...(opts.assetId ? { assetId: opts.assetId } : {}),
    },
    orderBy: { periodStart: "asc" },
  });

  const result: PostDuePeriodsResult = { posted: [], skipped: [], errors: [] };
  for (const row of due) {
    try {
      await postDepreciationPeriod(orgId, row.id);
      result.posted.push(row.id);
    } catch (err) {
      if (err instanceof DocumentError) {
        result.skipped.push(row.id);
      } else {
        result.errors.push({
          scheduleId: row.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return result;
}

import { prisma } from "@/lib/prisma";
import { getEffectiveSubscription } from "@/lib/billing/subscription";
import { getPlanLimits } from "@/lib/billing/plans";

// ---------------------------------------------------------------------------
// Org storage accounting. The "used" number is always computed as
// SUM(Document.optimizedSizeBytes) for the org rather than a maintained
// counter column — one query, always correct, self-corrects if documents
// are ever deleted (no future migration needed to fix drift). Org sizes in
// this app are small enough (hundreds to low thousands of documents) that a
// SUM aggregate on every upload/check is cheap; if that ever changes, a
// maintained counter can be introduced without changing this function's
// signature.
// ---------------------------------------------------------------------------

export type StorageUsage = {
  usedBytes: number;
  limitBytes: number;
  documentCount: number;
};

export async function getStorageUsage(orgId: string): Promise<StorageUsage> {
  const [{ effectivePlan }, agg] = await Promise.all([
    getEffectiveSubscription(orgId),
    prisma.document.aggregate({
      where: { orgId },
      _sum: { optimizedSizeBytes: true },
      _count: true,
    }),
  ]);

  return {
    usedBytes: agg._sum.optimizedSizeBytes ?? 0,
    limitBytes: getPlanLimits(effectivePlan).storageBytes,
    documentCount: agg._count,
  };
}

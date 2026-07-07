import { prisma } from "@/lib/prisma";
import { currentYearMonth } from "@/lib/billing/ai-credits";

// ---------------------------------------------------------------------------
// Aggregate queries backing the internal commercial admin dashboard
// (app/(app)/admin/commercial/page.tsx). Every query here is a simple
// count/sum/groupBy over the whole platform (deliberately NOT org-scoped —
// this is the one place in the app that intentionally looks across every
// organization, gated by lib/billing/admin-access.ts#isPlatformAdmin).
// ---------------------------------------------------------------------------

export type PlanDistributionRow = { plan: string; count: number };

export type TopPartnerRow = { partnerId: string; partnerName: string; referralCount: number };

export type CommercialStats = {
  totalSignups: number;
  activeTrials: number;
  activePaidOrgs: number;
  // "Free" here means the org has no paying subscription right now:
  // status FREE (never subscribed / lazily downgraded) OR CANCELED (churned
  // back to Free limits). We count by status rather than by plan because a
  // CANCELED row can still carry a stale non-FREE `plan` value until the
  // next getEffectiveSubscription() read lazily corrects it.
  freeOrgs: number;
  planDistribution: PlanDistributionRow[];
  aiCreditsUsedThisMonth: number;
  aiUsageYearMonth: string;
  totalStorageBytes: number;
  totalReferrals: number;
  topPartners: TopPartnerRow[];
};

const TOP_PARTNERS_LIMIT = 5;

export async function getCommercialStats(now: Date = new Date()): Promise<CommercialStats> {
  const yearMonth = currentYearMonth(now);

  const [
    totalSignups,
    activeTrials,
    activePaidOrgs,
    freeOrgs,
    planGroups,
    aiUsageAgg,
    storageAgg,
    totalReferrals,
    topPartnerGroups,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.subscription.count({ where: { status: "TRIALING" } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: { in: ["FREE", "CANCELED"] } } }),
    prisma.subscription.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.aiCreditUsage.aggregate({ where: { yearMonth }, _sum: { creditsUsed: true } }),
    prisma.document.aggregate({ _sum: { optimizedSizeBytes: true } }),
    prisma.referral.count(),
    prisma.referral.groupBy({
      by: ["partnerId"],
      _count: { _all: true },
      orderBy: { _count: { partnerId: "desc" } },
      take: TOP_PARTNERS_LIMIT,
    }),
  ]);

  const planDistribution: PlanDistributionRow[] = planGroups.map((g) => ({
    plan: g.plan,
    count: g._count._all,
  }));

  const partnerIds = topPartnerGroups.map((g) => g.partnerId);
  const partners = partnerIds.length
    ? await prisma.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true } })
    : [];
  const partnerNameById = new Map(partners.map((p) => [p.id, p.name]));
  const topPartners: TopPartnerRow[] = topPartnerGroups.map((g) => ({
    partnerId: g.partnerId,
    partnerName: partnerNameById.get(g.partnerId) ?? "Unknown partner",
    referralCount: g._count._all,
  }));

  return {
    totalSignups,
    activeTrials,
    activePaidOrgs,
    freeOrgs,
    planDistribution,
    aiCreditsUsedThisMonth: aiUsageAgg._sum.creditsUsed ?? 0,
    aiUsageYearMonth: yearMonth,
    totalStorageBytes: storageAgg._sum.optimizedSizeBytes ?? 0,
    totalReferrals,
    topPartners,
  };
}

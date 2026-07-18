import type { Prisma, Subscription, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { TRIAL_LENGTH_DAYS, TRIAL_PLAN, type PlanId } from "@/lib/billing/plans";

// ---------------------------------------------------------------------------
// Subscription lifecycle: trial start, effective-plan resolution (including
// the non-destructive trial->FREE downgrade), and the trial banner query.
//
// "Effective" plan/status is always computed here rather than trusted
// blindly off the stored row, because a TRIALING row's trialEndsAt can pass
// at any moment without anything else touching the database. This module is
// the ONLY place that lazily rewrites a Subscription row to reflect that —
// and even then it only ever changes `plan`/`status` on the Subscription
// itself, never touches any business data (documents, invoices, etc.).
// ---------------------------------------------------------------------------

export type EffectiveSubscription = {
  subscription: Subscription;
  /** The plan whose limits should actually be enforced right now. */
  effectivePlan: PlanId;
  /** True once a trial has ended with no active paid subscription behind it. */
  trialExpired: boolean;
  /** Read/export access should never be blocked, even when downgraded. */
  readOnlyAccessAllowed: true;
};

// Nested-create payload for use inside the SAME transaction that creates a
// new Organization (see lib/org.ts#createOrganizationWithOwner) — keeps
// "org + trial subscription" atomic, exactly like the seeded chart of
// accounts. `plan` lets a caller start the trial on a specific tier (e.g. a
// marketing-site CTA for a named plan) — defaults to TRIAL_PLAN so every
// existing caller (and a bare /signup visit with no plan chosen) is unaffected.
export function trialSubscriptionCreateData(
  now: Date = new Date(),
  plan: PlanId = TRIAL_PLAN,
): Prisma.SubscriptionCreateWithoutOrgInput {
  const trialEndsAt = new Date(now.getTime() + TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000);
  return {
    plan,
    status: "TRIALING",
    trialStartAt: now,
    trialEndsAt,
  };
}

// Nested-create payload for a "start free, no trial" signup — same shape as
// the state getEffectiveSubscription() already lazily writes once a trial
// expires, so every other billing-aware code path (banners, plan-limit
// enforcement) already knows how to treat it correctly.
export function freeSubscriptionCreateData(): Prisma.SubscriptionCreateWithoutOrgInput {
  return {
    plan: "FREE",
    status: "FREE",
  };
}

// Defensive fallback for any organization that predates this feature (or
// otherwise has no Subscription row yet) — creates a fresh trial the first
// time it's looked up rather than crashing every billing-aware code path.
export async function getOrCreateSubscription(orgId: string): Promise<Subscription> {
  const existing = await prisma.subscription.findUnique({ where: { orgId } });
  if (existing) return existing;
  return prisma.subscription.upsert({
    where: { orgId },
    create: { orgId, ...trialSubscriptionCreateData() },
    update: {},
  });
}

function isTrialExpired(sub: Subscription, now: Date): boolean {
  return sub.status === "TRIALING" && !!sub.trialEndsAt && sub.trialEndsAt.getTime() <= now.getTime();
}

// Central "what plan applies right now" resolver. Lazily flips an expired
// trial to FREE/FREE — non-destructive (no business data changes), and
// idempotent (subsequent calls just see status=FREE already).
export async function getEffectiveSubscription(
  orgId: string,
  now: Date = new Date(),
): Promise<EffectiveSubscription> {
  let sub = await getOrCreateSubscription(orgId);

  if (isTrialExpired(sub, now)) {
    sub = await prisma.subscription.update({
      where: { orgId },
      data: { plan: "FREE", status: "FREE" },
    });
    return {
      subscription: sub,
      effectivePlan: "FREE",
      trialExpired: true,
      readOnlyAccessAllowed: true,
    };
  }

  // ACTIVE / PAST_DUE (grace period) both honor the configured plan.
  // CANCELED / FREE both fall back to Free limits. TRIALING (not yet
  // expired) honors the trial plan.
  const effectivePlan: PlanId =
    sub.status === "CANCELED" || sub.status === "FREE" ? "FREE" : (sub.plan as PlanId);

  return {
    subscription: sub,
    effectivePlan,
    trialExpired: false,
    readOnlyAccessAllowed: true,
  };
}

export type TrialBannerInfo = {
  plan: PlanId;
  trialEndsAt: Date;
  daysLeft: number;
  expired: boolean;
};

// Powers the "Your Business trial ends in X days" banner. Returns null once
// the org is no longer meaningfully "on trial" (already paid, already
// downgraded, no trial data at all).
export async function getTrialBannerInfo(orgId: string): Promise<TrialBannerInfo | null> {
  const { subscription, trialExpired } = await getEffectiveSubscription(orgId);
  if (subscription.status !== "TRIALING" || !subscription.trialEndsAt) return null;

  const msLeft = subscription.trialEndsAt.getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  return {
    plan: subscription.plan as PlanId,
    trialEndsAt: subscription.trialEndsAt,
    daysLeft,
    expired: trialExpired,
  };
}

// Admin/manual plan change — the only mutation path today (see
// lib/billing/provider.ts#ManualPaymentProvider). Kept here (rather than
// only in the provider) so it's independently testable and reusable by a
// future real provider's webhook handler.
export async function setSubscriptionPlanAndStatus(
  orgId: string,
  input: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    provider?: string | null;
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
  },
): Promise<Subscription> {
  await getOrCreateSubscription(orgId);
  return prisma.subscription.update({
    where: { orgId },
    data: {
      plan: input.plan,
      status: input.status,
      currentPeriodStart: input.currentPeriodStart ?? undefined,
      currentPeriodEnd: input.currentPeriodEnd ?? undefined,
      provider: input.provider ?? undefined,
      providerCustomerId: input.providerCustomerId ?? undefined,
      providerSubscriptionId: input.providerSubscriptionId ?? undefined,
    },
  });
}

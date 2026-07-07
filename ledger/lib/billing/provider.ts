import type { Subscription, SubscriptionPlan, SubscriptionStatus, PaymentRecord } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getEffectiveSubscription,
  setSubscriptionPlanAndStatus,
  type EffectiveSubscription,
} from "@/lib/billing/subscription";

// ---------------------------------------------------------------------------
// Payment provider abstraction.
//
// Every plan-changing / status-changing mutation to a `Subscription` row
// flows through ONE of these implementations, never directly through Prisma
// from a route/action — so that the day a real payment provider (Stripe, or
// a Mobile Money aggregator) is wired up, the swap is a one-line change in
// getPaymentProvider() below, not a rewrite of every call site.
//
// Today only ManualPaymentProvider actually works end-to-end (no real
// payment credentials exist yet) — see the admin "set org plan" flow in
// app/actions/billing.ts, which is the only way to test a plan change.
// ---------------------------------------------------------------------------

// What the checkout flow needs to send the user to a hosted payment page and
// later reconcile the session. Modeled loosely on Stripe Checkout Sessions
// since that's the most likely first real integration, but kept generic
// enough that a Mobile Money redirect/USSD flow could also populate it.
export type CreateCheckoutSessionInput = {
  orgId: string;
  plan: Exclude<SubscriptionPlan, "FREE">;
  // Where to send the user back to after a successful/cancelled checkout.
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = {
  /** Provider-specific session identifier, opaque to callers. */
  sessionId: string;
  /** URL to redirect the user to in order to complete payment. */
  checkoutUrl: string;
  provider: string;
};

// Read-only snapshot of an org's subscription state, as far as this provider
// is concerned. For ManualPaymentProvider this is just a pass-through of
// getEffectiveSubscription(); a real provider would additionally reconcile
// against its own remote API/webhook state before returning.
export type ProviderSubscriptionStatus = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  effectivePlan: SubscriptionPlan;
  currentPeriodEnd: Date | null;
};

export interface PaymentProvider {
  /** Short machine-readable identifier, e.g. "manual" | "stripe". */
  readonly name: string;

  /**
   * Starts a hosted checkout flow for upgrading `orgId` to `plan`. Manual
   * has no such flow (there is no hosted page to redirect to) and rejects;
   * a real provider would create a remote checkout session and return its
   * URL.
   */
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;

  /** Current plan/status for `orgId`, from this provider's point of view. */
  getSubscriptionStatus(orgId: string): Promise<ProviderSubscriptionStatus>;

  /** Cancels `orgId`'s paid subscription, reverting it to FREE/CANCELED. */
  cancelSubscription(orgId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// ManualPaymentProvider — today's working default.
//
// There is no live payment integration, so plan changes are recorded by an
// allow-listed platform admin (see lib/billing/admin-access.ts and
// app/actions/billing.ts#adminSetOrgPlanAction) via adminSetPlan() below.
// This is deliberately the ONLY way to change plan/status end-to-end today.
// ---------------------------------------------------------------------------

export type AdminSetPlanInput = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  /** Length of the period a recorded payment covers, from `now`. Default 1. */
  periodMonths?: number;
  /**
   * Amount actually collected (minor units), if this call represents "an
   * admin recorded a payment" rather than a bare status change (e.g. moving
   * an org to CANCELED needs no amount). Only when this AND status ACTIVE
   * are both present is a PaymentRecord written.
   */
  amountMinorUnits?: bigint;
  notes?: string;
  /** Who performed the manual override, for the PaymentRecord audit trail. */
  createdById?: string;
  /** Injectable for deterministic tests; defaults to the real clock. */
  now?: Date;
};

export type AdminSetPlanResult = {
  subscription: Subscription;
  paymentRecord: PaymentRecord | null;
};

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

// The single manual-provider mutation path. Exported standalone (rather than
// only reachable via the class) so callers that already know they want the
// manual provider explicitly (the admin action) can import it directly
// without going through getPaymentProvider()'s auto-selection.
export async function adminSetPlan(orgId: string, input: AdminSetPlanInput): Promise<AdminSetPlanResult> {
  const now = input.now ?? new Date();
  const periodMonths = input.periodMonths ?? 1;

  const currentPeriodStart = now;
  const currentPeriodEnd = addMonths(now, periodMonths);

  const subscription = await setSubscriptionPlanAndStatus(orgId, {
    plan: input.plan,
    status: input.status,
    currentPeriodStart,
    currentPeriodEnd,
    provider: "manual",
  });

  // Only a genuinely "payment recorded" call (ACTIVE + an amount) writes a
  // billing-history row — a bare status change (e.g. admin flips someone to
  // PAST_DUE, or cancels them) has no associated payment to record. This
  // PaymentRecord shape is what the partner/commission workstream reads to
  // compute referral commissions, so orgId/amountMinorUnits/period/status
  // must all be populated correctly here.
  let paymentRecord: PaymentRecord | null = null;
  if (input.status === "ACTIVE" && input.amountMinorUnits != null) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { baseCurrency: true },
    });
    paymentRecord = await prisma.paymentRecord.create({
      data: {
        orgId,
        subscriptionId: subscription.id,
        amountMinorUnits: input.amountMinorUnits,
        currency: org?.baseCurrency ?? "XAF",
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
        provider: "manual",
        status: "SUCCEEDED",
        notes: input.notes ?? null,
        createdById: input.createdById ?? null,
      },
    });
  }

  return { subscription, paymentRecord };
}

export class ManualPaymentProvider implements PaymentProvider {
  readonly name = "manual";

  async createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    // No hosted checkout exists for the manual provider — plans are set
    // directly by a platform admin via the /admin/commercial panel. Throw a
    // clear, actionable error rather than pretending a session was created.
    throw new Error(
      "Manual provider has no checkout session — use the admin panel (/admin/commercial) to set a plan directly.",
    );
  }

  async getSubscriptionStatus(orgId: string): Promise<ProviderSubscriptionStatus> {
    const effective: EffectiveSubscription = await getEffectiveSubscription(orgId);
    return {
      plan: effective.subscription.plan,
      status: effective.subscription.status,
      effectivePlan: effective.effectivePlan,
      currentPeriodEnd: effective.subscription.currentPeriodEnd,
    };
  }

  async cancelSubscription(orgId: string): Promise<void> {
    await setSubscriptionPlanAndStatus(orgId, { plan: "FREE", status: "CANCELED" });
  }

  /** Convenience instance method delegating to the standalone function above. */
  async adminSetPlan(orgId: string, input: AdminSetPlanInput): Promise<AdminSetPlanResult> {
    return adminSetPlan(orgId, input);
  }
}

// ---------------------------------------------------------------------------
// StripeProvider — documented STUB, not wired to the real Stripe SDK.
//
// `stripe` is intentionally NOT a dependency of this project yet. Every
// method below throws a clear "not yet implemented" error. This class exists
// purely to (a) document the intended integration shape and (b) give
// getPaymentProvider() a real switch-over target once real credentials
// exist.
//
// Env vars a real implementation would need (NONE of these are required for
// the app to run today — StripeProvider is only selected when
// STRIPE_SECRET_KEY is set, see getPaymentProvider() below):
//   - STRIPE_SECRET_KEY            Server-side API key for the Stripe SDK.
//   - STRIPE_WEBHOOK_SECRET        Verifies incoming `checkout.session.*` /
//                                  `customer.subscription.*` webhook events.
//   - STRIPE_PRICE_ID_BUSINESS     Price object id for the Business plan.
//   - STRIPE_PRICE_ID_ENTERPRISE   Price object id for the Enterprise plan.
//   - STRIPE_PUBLISHABLE_KEY       (optional) only needed if a client-side
//                                  Stripe.js flow is added later; the server
//                                  redirect-to-Checkout flow assumed here
//                                  doesn't require it.
// ---------------------------------------------------------------------------
export class StripeProvider implements PaymentProvider {
  readonly name = "stripe";

  async createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    throw new Error("StripeProvider.createCheckoutSession is not yet implemented.");
  }

  async getSubscriptionStatus(_orgId: string): Promise<ProviderSubscriptionStatus> {
    throw new Error("StripeProvider.getSubscriptionStatus is not yet implemented.");
  }

  async cancelSubscription(_orgId: string): Promise<void> {
    throw new Error("StripeProvider.cancelSubscription is not yet implemented.");
  }
}

// Selects the live provider only when real credentials are configured;
// falls back to the manual provider (today's reality for every deployment)
// otherwise. This is the ONE place that decides which provider is "live".
export function getPaymentProvider(): PaymentProvider {
  if (process.env.STRIPE_SECRET_KEY) {
    return new StripeProvider();
  }
  return new ManualPaymentProvider();
}

// ---------------------------------------------------------------------------
// Mobile-Money-readiness note.
//
// Cameroon's dominant payment rails are MTN Mobile Money and Orange Money,
// not cards — a future `MobileMoneyProvider implements PaymentProvider`
// would plug into the EXACT SAME interface as StripeProvider above, with no
// new interface needed:
//   - createCheckoutSession(): instead of a hosted Checkout URL, this would
//     return a `checkoutUrl` pointing at the aggregator's payment page (or a
//     USSD-prompt confirmation page), keeping the same
//     { sessionId, checkoutUrl, provider } shape.
//   - getSubscriptionStatus() / cancelSubscription(): identical semantics —
//     read/cancel the org's subscription — regardless of which rail
//     collected the money.
// The only other change needed anywhere in the app would be one more branch
// in getPaymentProvider() (e.g. selecting MobileMoneyProvider based on an
// org's country or an env flag) — no call site of PaymentProvider changes.
// ---------------------------------------------------------------------------

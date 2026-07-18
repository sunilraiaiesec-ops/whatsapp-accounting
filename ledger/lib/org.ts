import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_CHART_OF_ACCOUNTS } from "@/lib/chart-of-accounts";
import { trialSubscriptionCreateData, freeSubscriptionCreateData } from "@/lib/billing/subscription";
import { attributeReferralWithin } from "@/lib/billing/partners";
import { sendNewMemberNotification } from "@/lib/email";

export class SignupError extends Error {}

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  orgName: string;
  baseCurrency?: string;
  phone: string;
  whatsapp?: string | null;
  // Referral code captured from the `?ref=CODE` 90-day cookie at signup time
  // (see lib/billing/partners.ts#REFERRAL_COOKIE_NAME). Optional — most
  // signups have no referrer.
  referralCode?: string | null;
  // Plan chosen via a marketing-site pricing CTA (e.g.
  // /signup?plan=professional). Unset/unrecognized falls back to today's
  // default: a 14-day Business trial.
  requestedPlan?: "free" | "professional" | "enterprise";
};

function subscriptionCreateDataForPlan(
  requestedPlan: SignupInput["requestedPlan"],
  now: Date,
): Prisma.SubscriptionCreateWithoutOrgInput {
  if (requestedPlan === "free") return freeSubscriptionCreateData();
  if (requestedPlan === "enterprise") return trialSubscriptionCreateData(now, "ENTERPRISE");
  return trialSubscriptionCreateData(now, "BUSINESS");
}

// Provisions a brand-new tenant: organization + seeded chart of accounts +
// owner user + membership + a 14-day Business trial subscription (+ referral
// attribution, if a valid code was captured). Runs in a single transaction
// so a half-created tenant can never exist.
export async function createOrganizationWithOwner(input: SignupInput) {
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new SignupError("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const baseCurrency = (input.baseCurrency ?? "XAF").toUpperCase();

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.orgName.trim(),
        baseCurrency,
        accounts: {
          create: DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
            code: a.code,
            name: a.name,
            type: a.type,
            subtype: a.subtype ?? null,
            isControl: a.isControl ?? false,
            currency: baseCurrency,
          })),
        },
        subscription: {
          create: subscriptionCreateDataForPlan(input.requestedPlan, new Date()),
        },
      },
    });

    const user = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        phone: input.phone.trim(),
        whatsapp: input.whatsapp?.trim() || null,
      },
    });

    await tx.membership.create({
      data: { orgId: org.id, userId: user.id, role: "OWNER" },
    });

    if (input.referralCode) {
      await attributeReferralWithin(tx, org.id, input.referralCode);
    }

    return { org, user };
  });
}

/**
 * Notifies the team of a new signup. Never throws — mirrors
 * lib/auth/account.ts#sendUserVerification's delivery-failure handling, so a
 * Resend outage can never block or fail the signup flow itself.
 */
export async function notifyNewMemberSignup(input: SignupInput): Promise<void> {
  try {
    await sendNewMemberNotification({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      whatsapp: input.whatsapp?.trim() || null,
      orgName: input.orgName.trim(),
      baseCurrency: (input.baseCurrency ?? "XAF").toUpperCase(),
    });
  } catch (err) {
    console.error("[org] new member notification failed:", err);
  }
}

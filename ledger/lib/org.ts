import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_CHART_OF_ACCOUNTS } from "@/lib/chart-of-accounts";
import { trialSubscriptionCreateData } from "@/lib/billing/subscription";
import { attributeReferralWithin } from "@/lib/billing/partners";

export class SignupError extends Error {}

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  orgName: string;
  baseCurrency?: string;
  // Referral code captured from the `?ref=CODE` 90-day cookie at signup time
  // (see lib/billing/partners.ts#REFERRAL_COOKIE_NAME). Optional — most
  // signups have no referrer.
  referralCode?: string | null;
};

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
          create: trialSubscriptionCreateData(),
        },
      },
    });

    const user = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
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

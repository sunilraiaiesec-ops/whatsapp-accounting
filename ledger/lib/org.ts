import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_CHART_OF_ACCOUNTS } from "@/lib/chart-of-accounts";

export class SignupError extends Error {}

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  orgName: string;
  baseCurrency?: string;
};

// Provisions a brand-new tenant: organization + seeded chart of accounts +
// owner user + membership. Runs in a single transaction so a half-created
// tenant can never exist.
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

    return { org, user };
  });
}

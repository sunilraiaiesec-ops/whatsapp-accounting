import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Canonical registry for the three Bantoo Books demonstration organizations.
// Demo orgs are identified by owner email — there is no isDemo flag in the DB.
// ---------------------------------------------------------------------------

export const DEMO_PASSWORD = "DemoBooks2025!";

export const DEMO_ACCOUNT_EMAILS = [
  "central.demo@bantoobooks.com",
  "atlantic.demo@bantoobooks.com",
  "prime.demo@bantoobooks.com",
] as const;

export type DemoAccountEmail = (typeof DEMO_ACCOUNT_EMAILS)[number];

export type DemoCompanyConfig = {
  key: string;
  name: string;
  email: DemoAccountEmail;
};

export const DEMO_COMPANIES: readonly DemoCompanyConfig[] = [
  {
    key: "central",
    name: "Central Distribution Cameroon SARL",
    email: "central.demo@bantoobooks.com",
  },
  {
    key: "atlantic",
    name: "Atlantic Food Distribution SARL",
    email: "atlantic.demo@bantoobooks.com",
  },
  {
    key: "prime",
    name: "Prime Consumer Supplies SARL",
    email: "prime.demo@bantoobooks.com",
  },
] as const;

const DEMO_EMAIL_SET = new Set<string>(DEMO_ACCOUNT_EMAILS);

export function isDemoAccountEmail(email: string): boolean {
  return DEMO_EMAIL_SET.has(email.trim().toLowerCase());
}

export type ResolvedDemoOrg = {
  orgId: string;
  email: DemoAccountEmail;
  orgName: string;
  expectedName: string;
};

/** Maps a demo login email to the live org row in the database. */
export async function resolveDemoOrgByEmail(email: string): Promise<ResolvedDemoOrg | null> {
  const normalized = email.trim().toLowerCase();
  if (!isDemoAccountEmail(normalized)) return null;

  const expected = DEMO_COMPANIES.find((c) => c.email === normalized);
  if (!expected) return null;

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
        take: 1,
        include: { org: { select: { id: true, name: true } } },
      },
    },
  });

  const membership = user?.memberships[0];
  if (!membership) return null;

  return {
    orgId: membership.org.id,
    email: normalized as DemoAccountEmail,
    orgName: membership.org.name,
    expectedName: expected.name,
  };
}

/** @deprecated Use resolveDemoOrgByEmail — kept for callers that only need the id. */
export async function findDemoOrgIdByEmail(email: string): Promise<string | null> {
  const resolved = await resolveDemoOrgByEmail(email);
  return resolved?.orgId ?? null;
}

// Match by demo-user email on any membership for the org. Production stores the
// role enum as "OWNER" (uppercase) — do not filter on a lowercase "owner" string.
export async function isDemoOrgId(orgId: string): Promise<boolean> {
  const member = await prisma.membership.findFirst({
    where: {
      orgId,
      user: { email: { in: [...DEMO_ACCOUNT_EMAILS] } },
    },
    select: { id: true },
  });
  return member !== null;
}

export async function listDemoOrgIds(): Promise<string[]> {
  const resolved = await Promise.all(DEMO_COMPANIES.map((c) => resolveDemoOrgByEmail(c.email)));
  return resolved.filter((r): r is ResolvedDemoOrg => r !== null).map((r) => r.orgId);
}

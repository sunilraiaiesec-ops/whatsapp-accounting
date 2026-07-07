import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

export type CurrentContext = {
  userId: string;
  orgId: string;
  userName: string;
  userEmail: string;
  orgName: string;
  baseCurrency: string;
  role: string;
  emailVerified: boolean;
  // Org-level toggle for the approval workflow (see lib/permissions.ts §11 /
  // lib/approvals/*). Piggybacks on the membership query below (the org row
  // is already fetched) rather than a second query.
  approvalWorkflowEnabled: boolean;
};

// Resolves the signed-in user and their active organization, verifying the
// membership still exists. Returns null if not authenticated.
export async function getCurrentContext(): Promise<CurrentContext | null> {
  const session = await getSession();
  if (!session) return null;

  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: session.orgId, userId: session.userId } },
    include: { user: true, org: true },
  });
  if (!membership) return null;

  return {
    userId: membership.userId,
    orgId: membership.orgId,
    userName: membership.user.name,
    userEmail: membership.user.email,
    orgName: membership.org.name,
    baseCurrency: membership.org.baseCurrency,
    role: membership.role,
    emailVerified: membership.user.emailVerified != null,
    approvalWorkflowEnabled: membership.org.approvalWorkflowEnabled,
  };
}

// Use inside protected server components / actions. Redirects to /login when
// there is no valid session.
export async function requireContext(): Promise<CurrentContext> {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

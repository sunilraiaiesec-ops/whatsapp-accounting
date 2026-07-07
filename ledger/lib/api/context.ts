import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth/tokens";
import type { CurrentContext } from "@/lib/auth/current";

export async function getApiContext(
  request: Request,
): Promise<CurrentContext | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const session = await verifyAuthToken(token);
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

export async function requireApiContext(request: Request): Promise<CurrentContext> {
  const ctx = await getApiContext(request);
  if (!ctx) {
    throw new ApiAuthError();
  }
  return ctx;
}

export class ApiAuthError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "ApiAuthError";
  }
}

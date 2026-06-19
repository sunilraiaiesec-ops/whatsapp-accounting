import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createAuthToken } from "@/lib/auth/tokens";
import { createOrganizationWithOwner, SignupError } from "@/lib/org";
import { error, json } from "@/lib/api/http";

export { OPTIONS } from "@/lib/api/route-options";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { memberships: { orderBy: { createdAt: "asc" }, take: 1, include: { org: true } } },
  });

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return error("Invalid email or password", 401);
  }

  const membership = user.memberships[0];
  if (!membership) {
    return error("This account has no organization", 403);
  }

  const token = await createAuthToken({
    userId: user.id,
    orgId: membership.orgId,
  });

  return json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
    org: {
      id: membership.org.id,
      name: membership.org.name,
      baseCurrency: membership.org.baseCurrency,
    },
  });
}

import { NextResponse } from "next/server";

import { verifyEmail } from "@/lib/auth/account";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// GET (not a page) because activating an account means setting the session
// cookie, and Next.js only allows cookies().set() inside a Server Action or
// a Route Handler — never inside a Server Component's render body.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const result = token ? await verifyEmail(token) : null;

  if (!result) {
    return NextResponse.redirect(new URL("/check-email?expired=1", request.url));
  }

  // Mirrors loginAction's "first membership" lookup — verifyEmail only
  // returns the userId, not which org to attach the session to.
  const membership = await prisma.membership.findFirst({
    where: { userId: result.userId },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    return NextResponse.redirect(new URL("/check-email?expired=1", request.url));
  }

  await createSession({ userId: result.userId, orgId: membership.orgId });
  return NextResponse.redirect(new URL("/onboarding", request.url));
}

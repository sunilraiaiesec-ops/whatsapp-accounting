import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { corsHeaders } from "@/lib/api/http";
import { REFERRAL_COOKIE_DAYS } from "@/lib/billing/plans";

// Mirrors lib/billing/partners.ts#REFERRAL_COOKIE_NAME. Duplicated as a
// literal here (rather than imported) because that module pulls in the
// Prisma client via lib/prisma.ts, which is not edge-runtime compatible —
// middleware.ts runs in the edge runtime. lib/billing/plans.ts has no such
// dependency (pure constants), so it's safe to import directly.
const REFERRAL_COOKIE_NAME = "bantoo_ref";

export default function middleware(request: NextRequest) {
  // Referral capture: first-touch wins — a `?ref=CODE` param is captured
  // into a 90-day cookie only if one hasn't already been captured. Runs for
  // every matched path (see config.matcher below), including /api/v1/*, so
  // it's computed once up top and applied to whichever response the
  // existing branches below produce.
  const ref = request.nextUrl.searchParams.get("ref")?.trim();
  const alreadyCaptured = request.cookies.has(REFERRAL_COOKIE_NAME);

  function withReferralCookie(response: NextResponse): NextResponse {
    if (ref && !alreadyCaptured) {
      response.cookies.set(REFERRAL_COOKIE_NAME, ref, {
        maxAge: REFERRAL_COOKIE_DAYS * 24 * 60 * 60,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
      });
    }
    return response;
  }

  if (!request.nextUrl.pathname.startsWith("/api/v1")) {
    return withReferralCookie(NextResponse.next());
  }

  if (request.method === "OPTIONS") {
    return withReferralCookie(new NextResponse(null, { status: 204, headers: corsHeaders }));
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return withReferralCookie(response);
}

export const config = {
  matcher: ["/api/v1/:path*", "/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};

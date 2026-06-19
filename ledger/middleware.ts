import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { corsHeaders } from "@/lib/api/http";

export default function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/v1")) {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/api/v1/:path*"],
};

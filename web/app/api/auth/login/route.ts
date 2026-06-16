import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getApiUrl,
  parseSessionFromSetCookie,
  parseSessionFromSetCookieList,
  SESSION_COOKIE,
} from "@/lib/config";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  const password = body.password?.trim();

  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  const response = await fetch(`${getApiUrl()}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password, next: "/dashboard" }),
    redirect: "manual",
  });

  if (response.status !== 302) {
    return NextResponse.json({ error: "Wrong password. Try again." }, { status: 401 });
  }

  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  const sessionValue =
    parseSessionFromSetCookieList(setCookies) ??
    parseSessionFromSetCookie(response.headers.get("set-cookie"));

  if (!sessionValue) {
    return NextResponse.json(
      { error: "Login succeeded but session was not returned." },
      { status: 502 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  return NextResponse.json({ ok: true });
}

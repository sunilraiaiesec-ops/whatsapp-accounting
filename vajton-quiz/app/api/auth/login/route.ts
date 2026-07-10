import { NextResponse } from "next/server";
import { createSession, verifyLogin } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { username?: string; password?: string };
  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (!verifyLogin(username, password)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  await createSession(username);
  return NextResponse.json({ ok: true });
}

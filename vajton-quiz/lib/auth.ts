import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "vajton_quiz_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const s = process.env.AUTH_SECRET ?? "dev-only-change-me";
  return new TextEncoder().encode(s);
}

export function quizCredentials() {
  return {
    username: process.env.QUIZ_USERNAME ?? "ksunilrai",
    password: process.env.QUIZ_PASSWORD ?? "Cristina,1",
  };
}

export function verifyLogin(username: string, password: string): boolean {
  const creds = quizCredentials();
  return username.trim() === creds.username && password === creds.password;
}

export async function createSession(username: string) {
  const token = await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUsername(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

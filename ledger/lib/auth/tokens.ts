import { SignJWT, jwtVerify } from "jose";

import type { SessionPayload } from "@/lib/auth/session";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days for mobile

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createAuthToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAuthToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId === "string" && typeof payload.orgId === "string") {
      return { userId: payload.userId, orgId: payload.orgId };
    }
    return null;
  } catch {
    return null;
  }
}

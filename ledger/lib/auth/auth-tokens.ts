import { createHash, randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";

export type AuthTokenType = "password_reset" | "email_verify";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Creates a single-use token of the given type. Any existing unused tokens of
 * the same type for the user are invalidated first. Returns the raw token,
 * which is only ever exposed here (the DB stores just its SHA-256 hash).
 */
export async function createAuthToken(
  userId: string,
  type: AuthTokenType,
  ttlMs: number,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.authToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return raw;
}

/**
 * Validates and consumes a token. Returns the userId on success, or null if
 * the token is unknown, expired, or already used. Marks the token used.
 */
export async function consumeAuthToken(
  raw: string,
  type: AuthTokenType,
): Promise<string | null> {
  if (!raw) return null;
  const token = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });
  if (!token || token.type !== type) return null;
  if (token.usedAt) return null;
  if (token.expiresAt.getTime() <= Date.now()) return null;

  await prisma.authToken.update({
    where: { id: token.id },
    data: { usedAt: new Date() },
  });
  return token.userId;
}

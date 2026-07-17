import { createHash, randomInt } from "crypto";

import { prisma } from "@/lib/prisma";
import { sendPhoneVerificationCode, sendPhoneRecoveryCode } from "@/lib/sms";

export type VerificationCodeType = "PHONE_VERIFY" | "PHONE_RECOVERY";

// OTP codes are short-lived and attempt-limited — very different risk
// profile from AuthToken's long random link tokens (see lib/auth/auth-tokens.ts),
// which don't need a retry limit because their entropy makes guessing
// infeasible. A 6-digit code needs both an expiry and a cap on wrong guesses.
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Generates a new 6-digit code, invalidates any existing unused code of the
 * same type for the user, and sends it via SMS. Never throws on delivery
 * failure (mirrors sendUserVerification's email-side behavior) — a caller
 * that needs to know about delivery failure should catch inside its own
 * try/catch around the SMS send if it matters for that flow.
 */
export async function createVerificationCode(
  userId: string,
  phone: string,
  type: VerificationCodeType,
): Promise<void> {
  const code = generateCode();
  await prisma.verificationCode.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.verificationCode.create({
    data: {
      userId,
      type,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      maxAttempts: MAX_ATTEMPTS,
    },
  });

  try {
    if (type === "PHONE_VERIFY") {
      await sendPhoneVerificationCode(phone, code);
    } else {
      await sendPhoneRecoveryCode(phone, code);
    }
  } catch (err) {
    console.error("[phone-verification] SMS send failed:", err);
  }
}

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

/**
 * Checks a submitted code against the most recent unused code of the given
 * type for the user. A wrong guess increments `attempts`; once maxAttempts
 * is reached the code is locked out — the caller must request a new one via
 * createVerificationCode (which invalidates the locked one).
 */
export async function verifyCode(
  userId: string,
  submitted: string,
  type: VerificationCodeType,
): Promise<VerifyCodeResult> {
  const record = await prisma.verificationCode.findFirst({
    where: { userId, type, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return { ok: false, reason: "invalid" };
  if (record.attempts >= record.maxAttempts) return { ok: false, reason: "too_many_attempts" };
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  if (hashCode(submitted.trim()) !== record.codeHash) {
    const updated = await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return updated.attempts >= updated.maxAttempts
      ? { ok: false, reason: "too_many_attempts" }
      : { ok: false, reason: "invalid" };
  }

  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return { ok: true };
}

/** Sends (or resends) a phone-verification SMS. Never throws. */
export async function sendPhoneVerification(userId: string, phone: string): Promise<void> {
  await createVerificationCode(userId, phone, "PHONE_VERIFY");
}

/** Consumes a verification code and marks the phone verified. */
export async function confirmPhoneVerification(
  userId: string,
  code: string,
): Promise<VerifyCodeResult> {
  const result = await verifyCode(userId, code, "PHONE_VERIFY");
  if (result.ok) {
    await prisma.user.update({ where: { id: userId }, data: { phoneVerified: new Date() } });
  }
  return result;
}

/**
 * Starts phone-based account recovery. Only works for a phone that's
 * already verified — an unverified phone hasn't been proven to belong to
 * the account holder, so it can't be trusted for recovery. Never reveals
 * whether a matching account exists (mirrors requestPasswordReset).
 */
export async function requestPhoneRecovery(rawPhone: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { phone: rawPhone, phoneVerified: { not: null } },
  });
  if (!user || !user.phone) return;
  await createVerificationCode(user.id, user.phone, "PHONE_RECOVERY");
}

/**
 * Consumes a recovery code and returns the userId on success so the caller
 * can proceed to set a new password. Returns the same VerifyCodeResult shape
 * as confirmPhoneVerification for consistent UI handling.
 */
export async function confirmPhoneRecovery(
  rawPhone: string,
  code: string,
): Promise<VerifyCodeResult & { userId?: string }> {
  const user = await prisma.user.findFirst({
    where: { phone: rawPhone, phoneVerified: { not: null } },
  });
  if (!user) return { ok: false, reason: "invalid" };
  const result = await verifyCode(user.id, code, "PHONE_RECOVERY");
  return result.ok ? { ...result, userId: user.id } : result;
}

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createAuthToken, consumeAuthToken } from "@/lib/auth/auth-tokens";
import { appUrl, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";

export class AccountError extends Error {}

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Sends a password-reset email if the account exists. Never reveals whether an
 * account exists (no user enumeration) and never throws on delivery failure.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  try {
    const token = await createAuthToken(user.id, "password_reset", RESET_TTL_MS);
    await sendPasswordResetEmail(email, `${appUrl()}/reset-password?token=${token}`);
  } catch (err) {
    console.error("[account] password reset email failed:", err);
  }
}

/** Consumes a reset token and sets a new password. Throws AccountError on bad token. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) {
    throw new AccountError("Password must be at least 8 characters");
  }
  const userId = await consumeAuthToken(token, "password_reset");
  if (!userId) {
    throw new AccountError("This reset link is invalid or has expired. Request a new one.");
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    // Resetting via an emailed link also proves the address is reachable.
    data: { passwordHash, emailVerified: new Date() },
  });
}

/** Sends (or resends) an email-verification link. Never throws on delivery failure. */
export async function sendUserVerification(userId: string, email: string): Promise<void> {
  try {
    const token = await createAuthToken(userId, "email_verify", VERIFY_TTL_MS);
    await sendVerificationEmail(email.trim().toLowerCase(), `${appUrl()}/verify-email?token=${token}`);
  } catch (err) {
    console.error("[account] verification email failed:", err);
  }
}

/**
 * Consumes a verification token and marks the email verified. Returns the
 * verified user's id (so the caller can activate a session — accounts are
 * gated behind email confirmation, see loginAction) or null if the token is
 * invalid/expired/already used.
 */
export async function verifyEmail(token: string): Promise<{ userId: string } | null> {
  const userId = await consumeAuthToken(token, "email_verify");
  if (!userId) return null;
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  return { userId };
}

/**
 * Resends a verification email for an unauthenticated visitor who knows only
 * their email address (e.g. from the check-email page after signup, or after
 * a blocked login attempt). Never reveals whether an account exists, and is a
 * no-op for accounts that are already verified — mirrors requestPasswordReset's
 * privacy pattern. Never throws on delivery failure.
 */
export async function resendVerificationForEmail(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) return;
  await sendUserVerification(user.id, user.email);
}

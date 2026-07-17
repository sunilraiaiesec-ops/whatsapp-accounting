"use server";

import { redirect } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";
import { toE164 } from "@/lib/phone-e164";
import {
  sendPhoneVerification,
  confirmPhoneVerification,
  requestPhoneRecovery,
  confirmPhoneRecovery,
} from "@/lib/auth/phone-verification";
import { createAuthToken } from "@/lib/auth/auth-tokens";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export type PhoneVerifyState = { error?: string; done?: boolean; codeSent?: boolean };

const HOUR = 60 * 60 * 1000;

const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  invalid: "Incorrect code. Please try again.",
  expired: "This code has expired. Request a new one.",
  too_many_attempts: "Too many incorrect attempts. Request a new code.",
};

/**
 * Sends (or resends) a phone-verification SMS for the signed-in user,
 * allowing them to correct the number first (see task: "change an
 * incorrect... phone number") — this is post-login, so unlike the pending-
 * email case there's no identity problem in letting them just retype it.
 */
export async function sendPhoneVerificationCodeAction(
  _prev: PhoneVerifyState,
  formData: FormData,
): Promise<PhoneVerifyState> {
  const ctx = await requireContext();
  const phone = toE164(String(formData.get("phone") || ""));
  if (!phone) return { error: "Enter a valid phone number" };

  const limit = await rateLimit(`phone-verify-send:${ctx.userId}`, 3, HOUR);
  if (!limit.ok) {
    return { error: "Please wait before requesting another code." };
  }

  // Persist the (possibly corrected) number now, so the code we send always
  // matches what's stored — and clear any stale verified state until the
  // new code is confirmed.
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { phone, phoneVerified: null },
  });
  await sendPhoneVerification(ctx.userId, phone);
  return { codeSent: true };
}

export async function confirmPhoneVerificationCodeAction(
  _prev: PhoneVerifyState,
  formData: FormData,
): Promise<PhoneVerifyState> {
  const ctx = await requireContext();
  const code = String(formData.get("code") || "").trim();
  if (!code) return { error: "Enter the code" };

  const result = await confirmPhoneVerification(ctx.userId, code);
  if (!result.ok) {
    return { error: VERIFY_ERROR_MESSAGES[result.reason] };
  }
  return { done: true };
}

const recoveryPhoneKey = (phone: string) => `phone-recovery:${phone}`;

/**
 * Starts phone-based account recovery — the "Use phone instead" path off
 * /forgot-password. Only works for an already-verified phone (see
 * requestPhoneRecovery's own doc comment); always reports success either
 * way so the flow doesn't leak whether a phone number is registered.
 */
export async function requestPhoneRecoveryAction(
  _prev: PhoneVerifyState,
  formData: FormData,
): Promise<PhoneVerifyState> {
  const phone = toE164(String(formData.get("phone") || ""));
  if (!phone) return { error: "Enter a valid phone number" };

  const ip = await clientIp();
  const [ipLimit, phoneLimit] = await Promise.all([
    rateLimit(`phone-recovery:ip:${ip}`, 5, HOUR),
    rateLimit(recoveryPhoneKey(phone), 3, HOUR),
  ]);
  if (!ipLimit.ok || !phoneLimit.ok) {
    return { error: "Too many requests. Please try again later." };
  }

  await requestPhoneRecovery(phone);
  return { codeSent: true };
}

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour — matches lib/auth/account.ts's email reset link TTL

/**
 * Consumes a recovery code and, on success, generates a normal password-
 * reset token and sends the user straight to the existing /reset-password
 * page — reuses that page's tested UI/action instead of building a second
 * "set new password" flow. Possessing the code sent to the verified phone
 * is the identity proof here, same trust level as clicking an emailed link.
 */
export async function confirmPhoneRecoveryAction(
  _prev: PhoneVerifyState,
  formData: FormData,
): Promise<PhoneVerifyState> {
  const phone = toE164(String(formData.get("phone") || ""));
  const code = String(formData.get("code") || "").trim();
  if (!phone) return { error: "Enter a valid phone number" };
  if (!code) return { error: "Enter the code" };

  const result = await confirmPhoneRecovery(phone, code);
  if (!result.ok) {
    return { error: VERIFY_ERROR_MESSAGES[result.reason] };
  }

  const token = await createAuthToken(result.userId!, "password_reset", RESET_TTL_MS);
  redirect(`/reset-password?token=${token}`);
}

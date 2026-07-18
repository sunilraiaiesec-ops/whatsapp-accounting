"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { createOrganizationWithOwner, notifyNewMemberSignup, SignupError } from "@/lib/org";
import {
  requestPasswordReset,
  resetPassword,
  sendUserVerification,
  resendVerificationForEmail,
  AccountError,
} from "@/lib/auth/account";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { readReferralCookieCode } from "@/lib/billing/partners";
import { isDemoAccountEmail } from "@/lib/demo-accounts";
import { maybeRefreshDemoAccount } from "@/lib/demo-refresh";
import { toE164 } from "@/lib/phone-e164";

export type AuthState = { error?: string; done?: boolean };

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Your name is required"),
    orgName: z.string().trim().min(1, "Company name is required"),
    email: z.string().trim().email("Enter a valid email"),
    confirmEmail: z.string().trim().email("Re-enter your email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    baseCurrency: z.string().trim().min(3).max(3).default("XAF"),
    phone: z.string().trim().min(1, "Phone number is required"),
    whatsapp: z.string().trim().optional(),
    plan: z.enum(["free", "professional", "enterprise"]).optional(),
  })
  .refine((data) => data.email.toLowerCase() === data.confirmEmail.toLowerCase(), {
    message: "Email addresses do not match",
    path: ["confirmEmail"],
  });

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    orgName: formData.get("orgName"),
    email: formData.get("email"),
    confirmEmail: formData.get("confirmEmail"),
    password: formData.get("password"),
    baseCurrency: formData.get("baseCurrency") || "XAF",
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp") || undefined,
    plan: formData.get("plan") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Re-validate/normalize server-side — components/PhoneField.tsx already
  // submits E.164, but never trust client formatting.
  const phone = toE164(parsed.data.phone);
  if (!phone) return { error: "Enter a valid phone number" };
  let whatsapp: string | null = null;
  if (parsed.data.whatsapp) {
    whatsapp = toE164(parsed.data.whatsapp);
    if (!whatsapp) return { error: "Enter a valid WhatsApp number" };
  }

  const ip = await clientIp();
  const limit = await rateLimit(`signup:${ip}`, 5, HOUR);
  if (!limit.ok) {
    return { error: "Too many sign-up attempts. Please try again later." };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude it from the spread below
  const { confirmEmail, plan, ...signupFields } = parsed.data;

  let email: string;
  try {
    const referralCode = await readReferralCookieCode();
    const { user } = await createOrganizationWithOwner({
      ...signupFields,
      phone,
      whatsapp,
      referralCode,
      requestedPlan: plan,
    });
    await sendUserVerification(user.id, user.email);
    await notifyNewMemberSignup({ ...signupFields, phone, whatsapp });
    email = user.email;
  } catch (err) {
    if (err instanceof SignupError) return { error: err.message };
    console.error(err);
    return { error: "Could not create account. Please try again." };
  }

  // Accounts are activated by clicking the confirmation link, not at signup
  // — no session is created here. See app/verify-email/page.tsx, which
  // creates the session on a successful token and sends the new member into
  // /onboarding from there (the "how are you starting?" screen).
  redirect(`/check-email?email=${encodeURIComponent(email)}`);
}

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ip = await clientIp();
  const email = parsed.data.email.toLowerCase();
  const [ipLimit, emailLimit] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 15, 5 * MIN),
    rateLimit(`login:email:${email}`, 8, 15 * MIN),
  ]);
  if (!ipLimit.ok || !emailLimit.ok) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Invalid email or password" };
  }
  if (!user.emailVerified) {
    return {
      error:
        "Please confirm your email before signing in. Check your inbox for the confirmation link, or resend it.",
    };
  }
  const membership = user.memberships[0];
  if (!membership) {
    return { error: "This account has no organization" };
  }

  await createSession({ userId: user.id, orgId: membership.orgId });

  if (isDemoAccountEmail(email)) {
    try {
      await maybeRefreshDemoAccount(membership.orgId);
    } catch (err) {
      // Demo refresh must never block login.
      console.error("Demo refresh on login failed:", err);
    }
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

const forgotSchema = z.object({ email: z.string().trim().email("Enter a valid email") });

export async function requestPasswordResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ip = await clientIp();
  const limit = await rateLimit(`pwreset:${ip}`, 5, HOUR);
  if (!limit.ok) {
    return { error: "Too many requests. Please try again later." };
  }

  // Always report success — do not reveal whether an account exists.
  await requestPasswordReset(parsed.data.email);
  return { done: true };
}

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function resetPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await resetPassword(parsed.data.token, parsed.data.password);
  } catch (err) {
    if (err instanceof AccountError) return { error: err.message };
    console.error(err);
    return { error: "Could not reset password. Please try again." };
  }
  return { done: true };
}

export async function resendVerificationAction(): Promise<AuthState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const limit = await rateLimit(`verify:${session.userId}`, 3, HOUR);
  if (!limit.ok) {
    return { error: "Please wait before requesting another verification email." };
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Account not found" };
  if (user.emailVerified) return { done: true };

  await sendUserVerification(user.id, user.email);
  return { done: true };
}

const resendByEmailSchema = z.object({ email: z.string().trim().email("Enter a valid email") });

// Logged-out counterpart to resendVerificationAction, for the check-email
// page and the "please confirm your email" login block — the visitor has no
// session yet, only the email address they signed up with.
export async function resendVerificationByEmailAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = resendByEmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ip = await clientIp();
  const limit = await rateLimit(`verify-resend:${ip}`, 5, HOUR);
  if (!limit.ok) {
    return { error: "Too many requests. Please try again later." };
  }

  // Always report success — do not reveal whether an account exists.
  await resendVerificationForEmail(parsed.data.email);
  return { done: true };
}

const changePendingEmailSchema = z
  .object({
    oldEmail: z.string().trim().email("Enter a valid email"),
    password: z.string().min(1, "Password is required"),
    newEmail: z.string().trim().email("Enter a valid email"),
    confirmNewEmail: z.string().trim().email("Re-enter your new email address"),
  })
  .refine((data) => data.newEmail.toLowerCase() === data.confirmNewEmail.toLowerCase(), {
    message: "New email addresses do not match",
    path: ["confirmNewEmail"],
  });

/**
 * Lets someone who mistyped their email during signup correct it before
 * they've ever verified — there's no session to prove identity yet, so the
 * password re-entry (the one thing only the real signer-upper knows) is the
 * identity check here, same trust level as changing a password via a reset
 * token. Only works while the account is still unverified; once verified,
 * email changes should go through an authenticated account-settings flow
 * instead (not built yet — out of scope here).
 */
export async function changePendingEmailAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = changePendingEmailSchema.safeParse({
    oldEmail: formData.get("oldEmail"),
    password: formData.get("password"),
    newEmail: formData.get("newEmail"),
    confirmNewEmail: formData.get("confirmNewEmail"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ip = await clientIp();
  const limit = await rateLimit(`change-pending-email:${ip}`, 5, HOUR);
  if (!limit.ok) {
    return { error: "Too many attempts. Please try again later." };
  }

  const oldEmail = parsed.data.oldEmail.toLowerCase();
  const newEmail = parsed.data.newEmail.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: oldEmail } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Incorrect email or password" };
  }
  if (user.emailVerified) {
    return { error: "This account is already verified — sign in instead." };
  }
  if (oldEmail === newEmail) {
    return { error: "Enter a different email address" };
  }
  const existing = await prisma.user.findUnique({ where: { email: newEmail } });
  if (existing) {
    return { error: "An account with this email already exists" };
  }

  await prisma.user.update({ where: { id: user.id }, data: { email: newEmail } });
  await sendUserVerification(user.id, newEmail);

  redirect(`/check-email?email=${encodeURIComponent(newEmail)}`);
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { createOrganizationWithOwner, SignupError } from "@/lib/org";
import {
  requestPasswordReset,
  resetPassword,
  sendUserVerification,
  AccountError,
} from "@/lib/auth/account";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export type AuthState = { error?: string; done?: boolean };

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Your name is required"),
  orgName: z.string().trim().min(1, "Company name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  baseCurrency: z.string().trim().min(3).max(3).default("XAF"),
});

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    orgName: formData.get("orgName"),
    email: formData.get("email"),
    password: formData.get("password"),
    baseCurrency: formData.get("baseCurrency") || "XAF",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ip = await clientIp();
  const limit = await rateLimit(`signup:${ip}`, 5, HOUR);
  if (!limit.ok) {
    return { error: "Too many sign-up attempts. Please try again later." };
  }

  try {
    const { org, user } = await createOrganizationWithOwner(parsed.data);
    await sendUserVerification(user.id, user.email);
    await createSession({ userId: user.id, orgId: org.id });
  } catch (err) {
    if (err instanceof SignupError) return { error: err.message };
    console.error(err);
    return { error: "Could not create account. Please try again." };
  }

  redirect("/dashboard");
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
  const membership = user.memberships[0];
  if (!membership) {
    return { error: "This account has no organization" };
  }

  await createSession({ userId: user.id, orgId: membership.orgId });
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
